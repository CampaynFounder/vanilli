"""Modal function: 3 inputs -> 1 output. Kling (video+image) -> FFmpeg merge with audio -> watermark if trial -> Supabase. Deletes 3 inputs after."""
import os
import subprocess
import tempfile
import time
from typing import Optional

import jwt
import requests
from pathlib import Path

import modal

app = modal.App("vannilli-process-video")
img = modal.Image.debian_slim().apt_install("ffmpeg").pip_install("requests", "supabase", "fastapi", "pyjwt")

BUCKET = "vannilli"
INPUTS_PREFIX = "inputs"
OUTPUTS_PREFIX = "outputs"


@app.function(image=img, secrets=[modal.Secret.from_name("vannilli-secrets")], timeout=600)
@modal.fastapi_endpoint(method="POST")
def process_video(data: Optional[dict] = None):
    """POST JSON: { tracking_video_url, target_image_url, audio_track_url, generation_id, is_trial, generation_seconds?, prompt? }"""
    data = data or {}
    tracking_url = data.get("tracking_video_url")
    target_url = data.get("target_image_url")
    audio_url = data.get("audio_track_url")
    generation_id = data.get("generation_id")
    is_trial = data.get("is_trial", False)
    prompt = (data.get("prompt") or "").strip()[:100]
    gen_secs = float(data.get("generation_seconds") or 0)

    if not all([tracking_url, target_url, audio_url, generation_id]):
        return {"ok": False, "error": "Missing required fields"}

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    kling_base = os.environ.get("KLING_API_URL", "https://api.klingai.com/v1")
    # Kling: Access Key + Secret (JWT) or single Bearer. Secret can be KLING_SECRET_KEY or KLING_API_KEY.
    kling_access = os.environ.get("KLING_ACCESS_KEY")
    kling_secret = os.environ.get("KLING_SECRET_KEY") or os.environ.get("KLING_API_KEY")
    kling_api_key = os.environ.get("KLING_API_KEY")
    if kling_access and kling_secret:
        iat = int(time.time())
        tok = jwt.encode({"ak": kling_access, "iat": iat, "exp": iat + 3600}, kling_secret, algorithm="HS256")
        kling_bearer = tok.decode("utf-8") if isinstance(tok, bytes) else tok
        print(f"[vannilli] Kling auth: JWT from KLING_ACCESS_KEY + (KLING_SECRET_KEY or KLING_API_KEY)")
        print(f"[vannilli] Kling JWT: payload={{ak:<redacted>,iat:{iat},exp:{iat+3600}}} prefix={kling_bearer[:50]}...")
    elif kling_api_key:
        kling_bearer = kling_api_key
        print(f"[vannilli] Kling auth: KLING_API_KEY (single Bearer)")
    else:
        return {"ok": False, "error": "Video service is not configured. Please contact VANNILLI support."}
    # Log that we're using service_role (do not log the key). 403 often means anon key or missing RLS.
    print(f"[vannilli] SUPABASE_SERVICE_ROLE_KEY present: True, len={len(supabase_key)}")

    from supabase import create_client
    supabase = create_client(supabase_url, supabase_key)

    with tempfile.TemporaryDirectory() as d:
        base = Path(d)
        tracking_path = base / "tracking.mp4"
        target_path = base / "target.jpg"
        audio_path = base / "audio.mp3"
        kling_path = base / "kling.mp4"
        synced_path = base / "synced.mp4"
        final_path = base / "final.mp4"

        def download(u: str, p: Path):
            r = requests.get(u, timeout=120)
            r.raise_for_status()
            p.write_bytes(r.content)

        try:
            download(tracking_url, tracking_path)
            download(target_url, target_path)
            download(audio_url, audio_path)
        except Exception as e:
            _fail(supabase, generation_id, "Download failed. Please check your files and try again.")
            return {"ok": False, "error": "Download failed. Please check your files and try again."}

        tracking_url_for_kling = tracking_url
        audio_for_merge = audio_path

        # Trim tracking and audio to exactly generation_seconds so we only send gen_secs to Kling and merge.
        if gen_secs > 0:
            tracking_trimmed = base / "tracking_trimmed.mp4"
            audio_trimmed = base / "audio_trimmed.wav"
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(tracking_path), "-t", str(gen_secs), "-c", "copy", str(tracking_trimmed)],
                check=True, capture_output=True,
            )
            # -t trim; -c copy keeps codec (WAV stays WAV). FFmpeg accepts this in the merge.
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(audio_path), "-t", str(gen_secs), "-c", "copy", str(audio_trimmed)],
                check=True, capture_output=True,
            )
            audio_for_merge = audio_trimmed
            # Upload trimmed file to a NEW object (no upsert) to avoid UPDATE RLS; use for Kling and cleanup later.
            inp_trimmed = f"{INPUTS_PREFIX}/{generation_id}/tracking_trimmed.mp4"
            print(f"[vannilli] trim/upload: gen_secs={gen_secs}, path={inp_trimmed}")
            try:
                supabase.storage.from_(BUCKET).upload(inp_trimmed, tracking_trimmed.read_bytes(), file_options={"content-type": "video/mp4"})
                sig = supabase.storage.from_(BUCKET).create_signed_url(inp_trimmed, 3600)
                if isinstance(sig, tuple):
                    sig = sig[0] if sig else {}
                tracking_url_for_kling = (sig.get("signedUrl") or sig.get("signed_url")) if isinstance(sig, dict) else (getattr(sig, "signedUrl", None) or getattr(sig, "signed_url", None))
                if not tracking_url_for_kling:
                    tracking_url_for_kling = tracking_url
                print(f"[vannilli] trim/upload OK: {inp_trimmed}")
            except Exception as e:
                # Log full error for 403/RLS debugging (including response body if present).
                err_type = type(e).__name__
                err_msg = str(e)
                body = getattr(e, "body", None) or getattr(e, "message", None)
                resp = getattr(e, "response", None)
                if resp is not None:
                    err_msg += f" | response.status={getattr(resp,'status_code',None)}"
                    raw = getattr(resp, "text", None) or (getattr(resp, "content", b"")[:500] if hasattr(resp, "content") else None)
                    if raw is not None:
                        err_msg += f" body={raw!r}"
                print(f"[vannilli] trim/upload FAIL: type={err_type} {err_msg} body={body}")
                tracking_url_for_kling = tracking_url

        # Kling motion-control: driver_video + target_image. mode=standard (not "std"). character_orientation=image.
        # prompt: optional; describe context/environment, not motion. Kling caps; we send max 100 chars.
        payload = {
            "model_name": "kling-v2",
            "driver_video_url": tracking_url_for_kling,
            "target_image_url": target_url,
            "mode": "standard",
            "character_orientation": "image",
        }
        if prompt:
            payload["prompt"] = prompt
        try:
            r = requests.post(
                f"{kling_base}/videos/motion-control",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {kling_bearer}"},
                json=payload,
                timeout=60,
            )
            if not r.ok:
                try:
                    body = r.json()
                except Exception:
                    body = (r.text[:1500] if r.text else None) or r.reason
                err_log = f"Kling motion-control HTTP {r.status_code}: {body!r}"
                print(f"[vannilli] Kling start FAIL: {err_log}")
                _fail(supabase, generation_id, "Video generation failed. Please try again. If it persists, contact VANNILLI support.")
                return {"ok": False, "error": "Video generation failed. Please try again. If it persists, contact VANNILLI support."}
            j = r.json()
            if j.get("code") != 0:
                print(f"[vannilli] Kling start code!=0: {j.get('message', '')!r}")
                _fail(supabase, generation_id, "Video generation failed. Please try again.")
                return {"ok": False, "error": "Video generation failed. Please try again."}
            task_id = j["data"]["task_id"]
        except Exception as e:
            print(f"[vannilli] Kling start exception: {type(e).__name__} {e!r}")
            _fail(supabase, generation_id, "Video generation failed. Please try again.")
            return {"ok": False, "error": "Video generation failed. Please try again."}

        supabase.table("generations").update({"kling_task_id": task_id, "status": "processing"}).eq("id", generation_id).execute()

        kling_units_used = None

        # Poll Kling
        for _ in range(60):
            time.sleep(5)
            try:
                r = requests.get(
                    f"{kling_base}/videos/motion-control/{task_id}",
                    headers={"Authorization": f"Bearer {kling_bearer}"},
                    timeout=30,
                )
                r.raise_for_status()
                j = r.json()
                if j.get("code") != 0:
                    continue
                data = j.get("data") or {}
                st = data.get("task_status")
                if st == "failed":
                    print(f"[vannilli] Kling poll task failed: {j.get('message', '')!r}")
                    _fail(supabase, generation_id, "Video generation failed. Please try again.")
                    return {"ok": False, "error": "Video generation failed. Please try again."}
                if st == "succeed":
                    task_result = data.get("task_result") or {}
                    urls = task_result.get("videos") or []
                    if not urls:
                        _fail(supabase, generation_id, "Video generation produced no output. Please try again.")
                        return {"ok": False, "error": "Video generation produced no output. Please try again."}
                    v0 = urls[0] or {}
                    kling_video_url = v0.get("url")
                    if not kling_video_url:
                        _fail(supabase, generation_id, "Video generation produced no output. Please try again.")
                        return {"ok": False, "error": "Video generation produced no output. Please try again."}

                    # Final unit deduction (Kling may use unit_deduction, credit_used, units_used)
                    kling_units_used = data.get("unit_deduction") or data.get("credit_used") or data.get("units_used") or task_result.get("unit_deduction") or task_result.get("credit_used")
                    break
            except Exception as e:
                continue
        else:
            _fail(supabase, generation_id, "Video generation timed out. Please try again.")
            return {"ok": False, "error": "Video generation timed out. Please try again."}

        download(kling_video_url, kling_path)

        # FFmpeg: -i kling -i audio -map 0:v -map 1:a -c:v copy -c:a aac synced.mp4 (audio_for_merge is trimmed to gen_secs when gen_secs>0)
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(kling_path), "-i", str(audio_for_merge), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", str(synced_path)],
            check=True,
            capture_output=True,
        )

        # Only watermark: VANNILLI logo, for trial users only
        if is_trial:
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(synced_path), "-vf", "drawtext=text='VANNILLI.io':x=(w-text_w)/2:y=h-50:fontsize=24:fontcolor=white@0.7", "-c:a", "copy", str(final_path)],
                check=True,
                capture_output=True,
            )
        else:
            final_path = synced_path

        out_key = f"{OUTPUTS_PREFIX}/{generation_id}/final.mp4"
        supabase.storage.from_(BUCKET).upload(out_key, final_path.read_bytes(), file_options={"content-type": "video/mp4"})

        supabase.table("generations").update({
            "status": "completed",
            "final_video_r2_path": out_key,
            "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }).eq("id", generation_id).execute()

        gr = supabase.table("generations").select("project_id").eq("id", generation_id).single().execute()
        if gr.data and gr.data.get("project_id"):
            supabase.table("projects").update({"status": "completed"}).eq("id", gr.data["project_id"]).execute()

        # Delete input files from Storage (include tracking_trimmed.mp4 when we created it)
        inp_prefix = f"{INPUTS_PREFIX}/{generation_id}"
        to_remove = ["tracking.mp4", "target.jpg", "audio.mp3"]
        if gen_secs > 0:
            to_remove.append("tracking_trimmed.mp4")
        for name in to_remove:
            try:
                supabase.storage.from_(BUCKET).remove([f"{inp_prefix}/{name}"])
            except Exception:
                pass

    return {"ok": True, "path": out_key, "kling_units_used": kling_units_used}


@app.function(image=img, secrets=[modal.Secret.from_name("vannilli-secrets")], timeout=30)
@modal.fastapi_endpoint(method="GET")
def test_kling_auth():
    """GET: Build JWT from keys in vannilli-secrets and return it so you can paste into Kling's
    JWT verification. Also POSTs to the video API with dummy URLs to test. Set
    NEXT_PUBLIC_MODAL_TEST_VIDEO_API_URL to this endpoint's URL for the /debug 'Generate JWT' button.
    Returns: {ok, jwt?, payload_redacted?, expires_in?, verify_status?, verify_message?, message?}"""
    kling_base = os.environ.get("KLING_API_URL", "https://api.klingai.com/v1")
    kling_access = os.environ.get("KLING_ACCESS_KEY")
    kling_secret = os.environ.get("KLING_SECRET_KEY") or os.environ.get("KLING_API_KEY")
    kling_api_key = os.environ.get("KLING_API_KEY")

    # Build JWT from access+secret (same as process_video)
    jwt_token = None
    payload_redacted = None
    if kling_access and kling_secret:
        iat = int(time.time())
        pl = {"ak": kling_access, "iat": iat, "exp": iat + 3600}
        tok = jwt.encode(pl, kling_secret, algorithm="HS256")
        jwt_token = tok.decode("utf-8") if isinstance(tok, bytes) else tok
        ak = str(kling_access)
        payload_redacted = {"ak": f"{ak[:8]}...{ak[-4:]}" if len(ak) > 12 else "***", "iat": iat, "exp": iat + 3600}
    elif not kling_access and not kling_api_key:
        return {"ok": False, "message": "KLING_ACCESS_KEY and KLING_API_KEY (or KLING_SECRET_KEY) not set in vannilli-secrets."}
    elif kling_access and not kling_secret:
        return {"ok": False, "message": "KLING_API_KEY or KLING_SECRET_KEY must be set as the secret when KLING_ACCESS_KEY is set."}
    elif not kling_access:
        return {"ok": False, "message": "KLING_ACCESS_KEY not set. Add it to vannilli-secrets to build a JWT (KLING_API_KEY is the secret)."}

    bearer = jwt_token if jwt_token else kling_api_key
    url = f"{kling_base.rstrip('/')}/videos/motion-control"
    req_payload = {
        "model_name": "kling-v2",
        "driver_video_url": "https://example.com/dummy.mp4",
        "target_image_url": "https://example.com/dummy.jpg",
        "mode": "standard",
        "character_orientation": "image",
    }
    verify_status = None
    verify_message = None
    try:
        r = requests.post(url, json=req_payload, headers={"Content-Type": "application/json", "Authorization": f"Bearer {bearer}"}, timeout=25)
        verify_status = r.status_code
        body = {}
        try:
            body = r.json()
        except Exception:
            pass
        code = body.get("code")
        msg = body.get("message", "")
        if r.status_code == 401:
            verify_message = "Auth failed (401). Token rejected by video API."
            out = {"ok": False, "verify_status": verify_status, "verify_message": verify_message}
            if jwt_token:
                out["jwt"] = jwt_token
                out["payload_redacted"] = payload_redacted
                out["expires_in"] = 3600
            out["message"] = verify_message
            return out
        if r.status_code >= 400:
            verify_message = f"Auth OK. Video API returned {r.status_code} (code={code}, message={msg!r}). Dummy URLs are invalid."
        else:
            verify_message = "Auth OK. Video API accepted the request."
    except Exception as e:
        verify_message = f"Request failed: {e!r}"
        return {"ok": False, "verify_message": verify_message, "message": verify_message, "jwt": jwt_token, "payload_redacted": payload_redacted, "expires_in": 3600 if jwt_token else None}

    out = {"ok": True, "verify_status": verify_status, "verify_message": verify_message}
    if jwt_token:
        out["jwt"] = jwt_token
        out["payload_redacted"] = payload_redacted
        out["expires_in"] = 3600
    out["message"] = verify_message
    return out


def _fail(supabase, generation_id: str, msg: str):
    supabase.table("generations").update({"status": "failed", "error_message": msg}).eq("id", generation_id).execute()
