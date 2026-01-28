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
img = modal.Image.debian_slim().apt_install("ffmpeg").pip_install("requests", "supabase", "fastapi", "pyjwt", "audalign")

BUCKET = "vannilli"
INPUTS_PREFIX = "inputs"
OUTPUTS_PREFIX = "outputs"

def _cors_origins() -> list:
    # Comma-separated list; default includes production + local dev.
    raw = (os.environ.get("VANNILLI_CORS_ORIGINS") or "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return ["https://vannilli.xaino.io", "http://localhost:3000", "http://127.0.0.1:3000"]

def _run_ffmpeg(args: list, label: str):
    try:
        subprocess.run(args, check=True, capture_output=True)
    except subprocess.CalledProcessError as e:
        stderr = (e.stderr or b"").decode("utf-8", errors="replace")[:4000]
        stdout = (e.stdout or b"").decode("utf-8", errors="replace")[:4000]
        print(f"[vannilli] ffmpeg FAIL ({label}): rc={e.returncode} args={e.args!r}")
        if stdout:
            print(f"[vannilli] ffmpeg stdout ({label}): {stdout}")
        if stderr:
            print(f"[vannilli] ffmpeg stderr ({label}): {stderr}")
        raise


def process_video_impl(data: Optional[dict] = None):
    """POST JSON: { tracking_video_url, target_image_url, audio_track_url (optional), generation_id, is_trial, generation_seconds?, prompt? }"""
    data = data or {}
    def _str(v): return (v or "").strip() or None
    tracking_url = _str(data.get("tracking_video_url"))
    target_url = _str(data.get("target_image_url"))
    audio_url = _str(data.get("audio_track_url"))  # Optional
    generation_id = (data.get("generation_id") or "").strip() or None
    is_trial = data.get("is_trial", False)
    prompt = (data.get("prompt") or "").strip()[:100]
    gen_secs = float(data.get("generation_seconds") or 0)

    if not all([tracking_url, target_url, generation_id]):
        return {"ok": False, "error": "Missing required fields: tracking_video_url, target_image_url, generation_id"}

    _base = (os.environ.get("SUPABASE_URL") or "").strip()
    supabase_url = (_base.rstrip("/") + "/") if _base else _base
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    # fal.ai API: Use FAL_API_KEY (or KLING_API_KEY for backward compatibility)
    def _k(v): return (v or "").strip() or None
    fal_api_key = _k(os.environ.get("FAL_API_KEY")) or _k(os.environ.get("KLING_API_KEY"))
    if not fal_api_key:
        return {"ok": False, "error": "Video service is not configured. Please contact VANNILLI support."}
    print(f"[vannilli] Using fal.ai API with FAL_API_KEY")
    # Log that we're using service_role (do not log the key). 403 often means anon key or missing RLS.
    print(f"[vannilli] SUPABASE_SERVICE_ROLE_KEY present: True, len={len(supabase_key)}")

    from supabase import create_client
    supabase = create_client(supabase_url, supabase_key)

    with tempfile.TemporaryDirectory() as d:
        base = Path(d)
        tracking_path = base / "tracking.mp4"
        target_path = base / "target.jpg"
        audio_raw_path = base / "audio_raw"  # Will detect extension from URL
        audio_path = base / "audio.wav"  # Converted WAV for processing
        kling_path = base / "kling.mp4"
        synced_path = base / "synced.mp4"
        final_path = base / "final.mp4"
        watermark_path = base / "watermark.png"

        def download(u: str, p: Path):
            r = requests.get(u, timeout=120)
            r.raise_for_status()
            p.write_bytes(r.content)

        try:
            download(tracking_url, tracking_path)
            download(target_url, target_path)
            if audio_url:
                # Detect file extension from URL
                audio_ext = audio_url.lower().split('.')[-1].split('?')[0] if '.' in audio_url.lower() else 'mp3'
                audio_raw_path = base / f"audio_raw.{audio_ext}"
                download(audio_url, audio_raw_path)
                
                # Convert to WAV if needed (MP3, MP4, or other formats)
                if audio_ext not in ('wav', 'wave'):
                    print(f"[vannilli] Converting audio from {audio_ext.upper()} to WAV format...")
                    _run_ffmpeg(
                        ["ffmpeg", "-y", "-i", str(audio_raw_path), "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(audio_path)],
                        "convert-audio-to-wav",
                    )
                    print(f"[vannilli] Audio converted to WAV successfully")
                else:
                    # Already WAV, just copy/rename
                    import shutil
                    shutil.copy2(audio_raw_path, audio_path)
            # Download watermark if needed for trial users
            if is_trial:
                watermark_url = os.environ.get("VANNILLI_WATERMARK_URL") or "https://vannilli.xaino.io/logo/watermark.png"
                try:
                    download(watermark_url, watermark_path)
                    print(f"[vannilli] Watermark downloaded from {watermark_url}")
                except Exception as e:
                    print(f"[vannilli] Warning: Failed to download watermark from {watermark_url}: {e}. Using text watermark fallback.")
                    watermark_path = None
        except Exception as e:
            _fail(supabase, generation_id, "Download failed. Please check your files and try again.")
            return {"ok": False, "error": "Download failed. Please check your files and try again."}

        tracking_url_for_kling = tracking_url
        audio_for_merge = None

        # If audio is provided, do audio alignment logic
        if audio_url:
            print("[vannilli] Audio provided - performing alignment...")
            try:
                import audalign
            except ImportError:
                _fail(supabase, generation_id, "Audio alignment service unavailable. Please try again.")
                return {"ok": False, "error": "Audio alignment service unavailable. Please try again."}
            
            # Extract audio from tracking video for alignment
            tracking_audio_path = base / "tracking_audio.wav"
            _run_ffmpeg(
                ["ffmpeg", "-y", "-i", str(tracking_path), "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(tracking_audio_path)],
                "extract-tracking-audio",
            )
            
            # Find global offset using audalign
            alignment = audalign.target_align(
                str(audio_path),  # master audio (target)
                str(tracking_audio_path),  # video audio (to align)
            )
            global_offset = alignment.get("offset", 0.0)
            if not isinstance(global_offset, (int, float)):
                global_offset = float(global_offset)
            print(f"[vannilli] Global audio offset: {global_offset}s (master is {'ahead' if global_offset > 0 else 'behind'} video)")
            
            # Trim tracking video if needed
            if gen_secs > 0:
                tracking_trimmed = base / "tracking_trimmed.mp4"
                _run_ffmpeg(
                    ["ffmpeg", "-y", "-i", str(tracking_path), "-t", str(gen_secs), "-c", "copy", str(tracking_trimmed)],
                    "trim-video",
                )
                # Upload trimmed file for Kling
                inp_trimmed = f"{INPUTS_PREFIX}/{generation_id}/tracking_trimmed.mp4"
                print(f"[vannilli] Uploading trimmed video: {inp_trimmed}")
                try:
                    supabase.storage.from_(BUCKET).upload(inp_trimmed, tracking_trimmed.read_bytes(), file_options={"content-type": "video/mp4"})
                    sig = supabase.storage.from_(BUCKET).create_signed_url(inp_trimmed, 3600)
                    if isinstance(sig, tuple):
                        sig = sig[0] if sig else {}
                    tracking_url_for_kling = (sig.get("signedUrl") or sig.get("signed_url")) if isinstance(sig, dict) else (getattr(sig, "signedUrl", None) or getattr(sig, "signed_url", None))
                    if not tracking_url_for_kling:
                        tracking_url_for_kling = tracking_url
                    print(f"[vannilli] Trimmed video uploaded OK")
                except Exception as e:
                    print(f"[vannilli] Trimmed video upload failed, using original: {e}")
                    tracking_url_for_kling = tracking_url
            else:
                tracking_url_for_kling = tracking_url
            
            # Prepare aligned audio for merging (will extract after Kling completes)
            # Store offset and audio path for later use
            audio_for_merge = {
                "path": audio_path,
                "offset": global_offset,
                "duration": gen_secs if gen_secs > 0 else None,
            }
        else:
            # No audio: just use tracking video as-is (may trim if gen_secs > 0)
            print("[vannilli] No audio provided - using Kling output as-is")
            if gen_secs > 0:
                tracking_trimmed = base / "tracking_trimmed.mp4"
                _run_ffmpeg(
                    ["ffmpeg", "-y", "-i", str(tracking_path), "-t", str(gen_secs), "-c", "copy", str(tracking_trimmed)],
                    "trim-video",
                )
                inp_trimmed = f"{INPUTS_PREFIX}/{generation_id}/tracking_trimmed.mp4"
                print(f"[vannilli] Uploading trimmed video: {inp_trimmed}")
                try:
                    supabase.storage.from_(BUCKET).upload(inp_trimmed, tracking_trimmed.read_bytes(), file_options={"content-type": "video/mp4"})
                    sig = supabase.storage.from_(BUCKET).create_signed_url(inp_trimmed, 3600)
                    if isinstance(sig, tuple):
                        sig = sig[0] if sig else {}
                    tracking_url_for_kling = (sig.get("signedUrl") or sig.get("signed_url")) if isinstance(sig, dict) else (getattr(sig, "signedUrl", None) or getattr(sig, "signed_url", None))
                    if not tracking_url_for_kling:
                        tracking_url_for_kling = tracking_url
                    print(f"[vannilli] Trimmed video uploaded OK")
                except Exception as e:
                    print(f"[vannilli] Trimmed video upload failed, using original: {e}")
                    tracking_url_for_kling = tracking_url
            else:
                tracking_url_for_kling = tracking_url

        # fal.ai Kling motion-control: driver/reference video + image. character_orientation=image.
        fal_base_url = "https://queue.fal.run"
        fal_endpoint = "fal-ai/kling-video/v2.6/standard/motion-control"  # Full endpoint for submission
        fal_model_id = "kling-video/v2.6"  # Model ID for status/result endpoints (no namespace, no subpath)
        payload = {
            "image_url": target_url,
            "video_url": tracking_url_for_kling,
            "character_orientation": "image",  # "image" for portrait (max 10s) or "video" for full-body (max 30s)
        }
        if prompt:
            payload["prompt"] = prompt[:100]
        try:
            r = requests.post(
                f"{fal_base_url}/{fal_endpoint}",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Key {fal_api_key}",
                },
                json=payload,
                timeout=60,
            )
            if not r.ok:
                try:
                    body = r.json()
                except Exception:
                    body = (r.text[:1500] if r.text else None) or r.reason
                err_log = f"fal.ai motion-control HTTP {r.status_code}: {body!r}"
                print(f"[vannilli] fal.ai start FAIL: {err_log}")
                _fail(supabase, generation_id, "Video generation failed. Please try again. If it persists, contact VANNILLI support.")
                return {
                    "ok": False,
                    "error": "Video generation failed. Please try again. If it persists, contact VANNILLI support.",
                    "video_api_status": r.status_code,
                }
            j = r.json()
            # fal.ai returns request_id for queue-based endpoints
            task_id = j.get("request_id")
            if not task_id:
                error_msg = j.get("detail", {}).get("message") if isinstance(j.get("detail"), dict) else j.get("detail", "Unknown error")
                print(f"[vannilli] fal.ai start error: {error_msg!r}")
                _fail(supabase, generation_id, "Video generation failed. Please try again.")
                return {"ok": False, "error": "Video generation failed. Please try again."}
        except Exception as e:
            print(f"[vannilli] fal.ai start exception: {type(e).__name__} {e!r}")
            _fail(supabase, generation_id, "Video generation failed. Please try again.")
            return {"ok": False, "error": "Video generation failed. Please try again."}

        supabase.table("generations").update({"fal_request_id": task_id, "status": "processing"}).eq("id", generation_id).execute()

        kling_units_used = None

        # Poll fal.ai
        kling_units_used = None  # fal.ai doesn't provide unit deduction info in the same format
        for _ in range(60):
            time.sleep(5)
            try:
                # Get status (use base model_id, exclude subpath)
                r = requests.get(
                    f"{fal_base_url}/{fal_model_id}/requests/{task_id}/status",
                    headers={"Authorization": f"Key {fal_api_key}"},
                    timeout=30,
                )
                r.raise_for_status()
                j = r.json()
                status = j.get("status")
                
                if status == "FAILED":
                    error_data = j.get("error", {})
                    error_msg = error_data.get("message", str(error_data)) if isinstance(error_data, dict) else str(error_data) if error_data else "Unknown error"
                    print(f"[vannilli] fal.ai poll task failed: {error_msg!r}")
                    _fail(supabase, generation_id, "Video generation failed. Please try again.")
                    return {"ok": False, "error": "Video generation failed. Please try again."}
                if status == "COMPLETED":
                    # Get the result (use base model_id, exclude subpath)
                    result_r = requests.get(
                        f"{fal_base_url}/{fal_model_id}/requests/{task_id}",
                        headers={"Authorization": f"Key {fal_api_key}"},
                        timeout=30,
                    )
                    result_r.raise_for_status()
                    result_j = result_r.json()
                    
                    # Extract video URL from fal.ai response
                    # fal.ai returns: {"response": {"video": {"url": "...", ...}}}
                    response_data = result_j.get("response", {})
                    video_data = response_data.get("video") if response_data else result_j.get("video")
                    
                    if video_data:
                        if isinstance(video_data, dict):
                            kling_video_url = video_data.get("url")
                        elif isinstance(video_data, str):
                            kling_video_url = video_data
                        else:
                            kling_video_url = None
                        
                        if kling_video_url:
                            break
                    
                    _fail(supabase, generation_id, "Video generation produced no output. Please try again.")
                    return {"ok": False, "error": "Video generation produced no output. Please try again."}
                elif status in ("IN_PROGRESS", "IN_QUEUE"):
                    continue
                elif status in ("COMPLETED", "FAILED"):
                    break
            except Exception as e:
                continue
        else:
            _fail(supabase, generation_id, "Video generation timed out. Please try again.")
            return {"ok": False, "error": "Video generation timed out. Please try again."}

        download(kling_video_url, kling_path)

        # If audio provided, extract aligned slice and merge with Kling video
        if audio_for_merge and isinstance(audio_for_merge, dict):
            print("[vannilli] Extracting aligned audio slice and merging...")
            try:
                # Extract audio slice using global offset
                # Start time in master audio = 0 + offset (if offset is positive, master is ahead)
                # For gen_secs > 0, extract exactly gen_secs starting from offset
                audio_slice_path = base / "audio_aligned.wav"
                start_time = max(0.0, audio_for_merge["offset"])
                duration = audio_for_merge["duration"] if audio_for_merge["duration"] else None
                
                if duration:
                    # Extract exactly gen_secs starting from offset
                    _run_ffmpeg(
                        [
                            "ffmpeg", "-y", "-i", str(audio_for_merge["path"]),
                            "-ss", str(start_time),
                            "-t", str(duration),
                            "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le",
                            str(audio_slice_path)
                        ],
                        "extract-aligned-audio",
                    )
                else:
                    # Extract from offset to end
                    _run_ffmpeg(
                        [
                            "ffmpeg", "-y", "-i", str(audio_for_merge["path"]),
                            "-ss", str(start_time),
                            "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le",
                            str(audio_slice_path)
                        ],
                        "extract-aligned-audio",
                    )
                
                # Merge aligned audio with Kling video
                _run_ffmpeg(
                    [
                        "ffmpeg", "-y",
                        "-i", str(kling_path),
                        "-i", str(audio_slice_path),
                        "-map", "0:v:0",
                        "-map", "1:a:0",
                        "-c:v", "libx264",
                        "-preset", "veryfast",
                        "-pix_fmt", "yuv420p",
                        "-c:a", "aac",
                        "-b:a", "192k",
                        "-movflags", "+faststart",
                        "-shortest",
                        str(synced_path),
                    ],
                    "merge-audio",
                )
            except Exception as e:
                print(f"[vannilli] Audio alignment/merge failed: {e}")
                _fail(supabase, generation_id, "Audio/video merge failed. Please try again. If it persists, contact VANNILLI support.")
                return {"ok": False, "error": "Audio/video merge failed. Please try again. If it persists, contact VANNILLI support."}
        else:
            # No audio provided - copy Kling video as-is (it may have audio from the tracking video)
            print("[vannilli] No audio - using Kling output as-is")
            import shutil
            shutil.copy2(kling_path, synced_path)

        # Only watermark: VANNILLI logo, for trial users only
        if is_trial:
            if watermark_path and watermark_path.exists():
                # Use image watermark overlay (bottom-right corner, 20px padding)
                _run_ffmpeg(
                    [
                        "ffmpeg", "-y",
                        "-i", str(synced_path),
                        "-i", str(watermark_path),
                        "-filter_complex", "[1:v]scale=iw*0.15:-1[wm];[0:v][wm]overlay=W-w-20:H-h-20:format=auto",
                        "-c:a", "copy",
                        str(final_path)
                    ],
                    "watermark-image"
                )
            else:
                # Fallback to text watermark if image download failed
                _run_ffmpeg(
                    [
                        "ffmpeg", "-y",
                        "-i", str(synced_path),
                        "-vf", "drawtext=text='VANNILLI.io':x=(w-text_w)/2:y=h-50:fontsize=24:fontcolor=white@0.7",
                        "-c:a", "copy",
                        str(final_path)
                    ],
                    "watermark-text"
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
        to_remove = ["tracking.mp4", "target.jpg"]
        if audio_url:
            to_remove.append("audio.mp3")
        if gen_secs > 0:
            to_remove.append("tracking_trimmed.mp4")
        for name in to_remove:
            try:
                supabase.storage.from_(BUCKET).remove([f"{inp_prefix}/{name}"])
            except Exception:
                pass

    return {"ok": True, "path": out_key, "kling_units_used": kling_units_used}


def test_kling_auth_impl():
    """GET: Build JWT from keys in vannilli-secrets and return it so you can paste into Kling's
    JWT verification. Also POSTs to the video API with dummy URLs to test. Set
    NEXT_PUBLIC_MODAL_TEST_VIDEO_API_URL to this endpoint's URL for the /debug 'Generate JWT' button.
    Returns: {ok, jwt?, payload_redacted?, expires_in?, verify_status?, verify_message?, message?}"""
    kling_base = os.environ.get("KLING_API_URL", "https://api.klingai.com/v1")
    def _v(x): return (x or "").strip() or None
    kling_access = _v(os.environ.get("KLING_ACCESS_KEY"))
    kling_secret = _v(os.environ.get("KLING_SECRET_KEY") or os.environ.get("KLING_API_KEY"))
    kling_api_key = _v(os.environ.get("KLING_API_KEY"))

    # Build JWT from access+secret (same as process_video), or use single Bearer.
    jwt_token = None
    payload_redacted = None
    if kling_access and kling_secret:
        now = int(time.time())
        pl = {"iss": kling_access, "exp": now + 1800, "nbf": now - 5}
        headers = {"alg": "HS256", "typ": "JWT"}
        tok = jwt.encode(pl, kling_secret, algorithm="HS256", headers=headers)
        jwt_token = tok.decode("utf-8") if isinstance(tok, bytes) else tok
        iss = str(kling_access)
        payload_redacted = {"iss": f"{iss[:8]}...{iss[-4:]}" if len(iss) > 12 else "***", "nbf": now - 5, "exp": now + 1800}
        bearer = jwt_token
    elif kling_api_key:
        bearer = kling_api_key
    elif kling_access and not kling_secret:
        return {"ok": False, "message": "KLING_API_KEY or KLING_SECRET_KEY must be set as the secret when KLING_ACCESS_KEY is set."}
    elif not kling_access and not kling_api_key:
        return {"ok": False, "message": "KLING_ACCESS_KEY and KLING_API_KEY (or KLING_SECRET_KEY) not set in vannilli-secrets."}
    else:
        return {"ok": False, "message": "KLING_ACCESS_KEY not set. Add it to vannilli-secrets to build a JWT (KLING_API_KEY is the secret)."}

    # bearer is set from JWT or single-key branch above
    url = f"{kling_base.rstrip('/')}/videos/motion-control"
    req_payload = {
        "model_name": "kling-v2",
        "driver_video_url": "https://example.com/dummy.mp4",
        "target_image_url": "https://example.com/dummy.jpg",
        "mode": "std",
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
        msg = (body.get("message") or "")
        if r.status_code == 401:
            verify_message = "Auth failed (401). Token rejected by video API."
            out = {"ok": False, "verify_status": verify_status, "verify_message": verify_message}
            if jwt_token:
                out["jwt"] = jwt_token
                out["payload_redacted"] = payload_redacted
                out["expires_in"] = 1800
            out["message"] = verify_message
            return out
        if r.status_code >= 400:
            # If the provider says "access key is empty", keys may be swapped, empty, or wrong env.
            m = (msg or "").lower()
            if "access" in m and "empty" in m:
                verify_message = (
                    "The video service reported the access key is missing or invalid. "
                    "In Modal vannilli-secrets: set KLING_ACCESS_KEY to your Access Key (often ak_…) and "
                    "KLING_API_KEY or KLING_SECRET_KEY to your Secret Key. Ensure there are no extra spaces. "
                    "See modal_app/README.md."
                )
                out = {"ok": False, "verify_status": verify_status, "verify_message": verify_message, "message": verify_message}
                if jwt_token:
                    out["jwt"] = jwt_token
                    out["payload_redacted"] = payload_redacted
                    out["expires_in"] = 1800
                return out
            verify_message = f"Auth OK. Video API returned {r.status_code} (code={code}, message={msg!r}). Dummy URLs are invalid."
        else:
            verify_message = "Auth OK. Video API accepted the request."
    except Exception as e:
        verify_message = f"Request failed: {e!r}"
        return {"ok": False, "verify_message": verify_message, "message": verify_message, "jwt": jwt_token, "payload_redacted": payload_redacted, "expires_in": 1800 if jwt_token else None}

    out = {"ok": True, "verify_status": verify_status, "verify_message": verify_message}
    if jwt_token:
        out["jwt"] = jwt_token
        out["payload_redacted"] = payload_redacted
        out["expires_in"] = 1800
    out["message"] = verify_message
    return out


def _fail(supabase, generation_id: str, msg: str):
    supabase.table("generations").update({"status": "failed", "error_message": msg}).eq("id", generation_id).execute()


# ---- ASGI app with CORS for browser calls ----
@app.function(image=img, secrets=[modal.Secret.from_name("vannilli-secrets")], timeout=600)
@modal.asgi_app()
def api():
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse
    from starlette.middleware.cors import CORSMiddleware

    web = FastAPI()
    web.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @web.post("/")
    async def post_root(req: Request):
        try:
            data = await req.json()
        except Exception:
            data = {}
        # Return JSON (200) even on failure to avoid browser surfacing only "CORS" for 500s.
        try:
            out = process_video_impl(data)
        except Exception as e:
            print(f"[vannilli] process_video exception: {type(e).__name__} {e!r}")
            out = {"ok": False, "error": "Video generation failed. Please try again. If it persists, contact VANNILLI support."}
        return JSONResponse(out, status_code=200)

    @web.get("/test_kling_auth")
    async def get_test_kling_auth():
        try:
            out = test_kling_auth_impl()
        except Exception as e:
            print(f"[vannilli] test_kling_auth exception: {type(e).__name__} {e!r}")
            out = {"ok": False, "message": "Video service is not configured. Please contact VANNILLI support."}
        return JSONResponse(out, status_code=200)

    @web.get("/")
    async def get_root():
        return {"ok": True, "service": "vannilli-process-video"}

    return web
