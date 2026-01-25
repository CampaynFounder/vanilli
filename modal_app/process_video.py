"""Modal function: 3 inputs -> 1 output. Kling (video+image) -> FFmpeg merge with audio -> watermark if trial -> Supabase. Deletes 3 inputs after."""
import os
import subprocess
import tempfile
import time
import requests
from pathlib import Path

import modal
from starlette.requests import Request

app = modal.App("vannilli-process-video")
img = modal.Image.debian_slim().apt_install("ffmpeg").pip_install("requests", "supabase", "starlette", "fastapi")

BUCKET = "vannilli"
INPUTS_PREFIX = "inputs"
OUTPUTS_PREFIX = "outputs"


@app.function(image=img, secrets=[modal.Secret.from_name("vannilli-secrets")], timeout=600)
@modal.web_endpoint(method="POST")
async def process_video(request: Request):
    """POST JSON: { tracking_video_url, target_image_url, audio_track_url, generation_id, is_trial, prompt? }"""
    data = await request.json() or {}
    tracking_url = data.get("tracking_video_url")
    target_url = data.get("target_image_url")
    audio_url = data.get("audio_track_url")
    generation_id = data.get("generation_id")
    is_trial = data.get("is_trial", False)
    prompt = (data.get("prompt") or "").strip()[:100]

    if not all([tracking_url, target_url, audio_url, generation_id]):
        return {"ok": False, "error": "Missing required fields"}

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    kling_key = os.environ["KLING_API_KEY"]
    kling_base = os.environ.get("KLING_API_URL", "https://api.klingai.com/v1")

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
            _fail(supabase, generation_id, str(e))
            return {"ok": False, "error": f"Download failed: {e}"}

        # Kling motion-control: driver_video + target_image (mode=std, character_orientation=image). Only VANNILLI watermark for trial.
        # When Kling supports it, add optional "watermark": False to request no Kling watermark.
        # prompt: optional; describe context/environment, not motion. Kling does not publish a max; we cap at 100.
        payload = {
            "model_name": "kling-v2",
            "driver_video_url": tracking_url,
            "target_image_url": target_url,
            "mode": "std",
            "character_orientation": "image",
        }
        if prompt:
            payload["prompt"] = prompt
        try:
            r = requests.post(
                f"{kling_base}/videos/motion-control",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {kling_key}"},
                json=payload,
                timeout=60,
            )
            r.raise_for_status()
            j = r.json()
            if j.get("code") != 0:
                raise RuntimeError(j.get("message", "Kling error"))
            task_id = j["data"]["task_id"]
        except Exception as e:
            _fail(supabase, generation_id, f"Kling start: {e}")
            return {"ok": False, "error": str(e)}

        supabase.table("generations").update({"kling_task_id": task_id, "status": "processing"}).eq("id", generation_id).execute()

        kling_units_used = None

        # Poll Kling
        for _ in range(60):
            time.sleep(5)
            try:
                r = requests.get(
                    f"{kling_base}/videos/motion-control/{task_id}",
                    headers={"Authorization": f"Bearer {kling_key}"},
                    timeout=30,
                )
                r.raise_for_status()
                j = r.json()
                if j.get("code") != 0:
                    continue
                data = j.get("data") or {}
                st = data.get("task_status")
                if st == "failed":
                    _fail(supabase, generation_id, j.get("message", "Kling failed"))
                    return {"ok": False, "error": "Kling failed"}
                if st == "succeed":
                    task_result = data.get("task_result") or {}
                    urls = task_result.get("videos") or []
                    if not urls:
                        _fail(supabase, generation_id, "No video URL in Kling result")
                        return {"ok": False, "error": "No video URL"}
                    v0 = urls[0] or {}
                    kling_video_url = v0.get("url")
                    if not kling_video_url:
                        _fail(supabase, generation_id, "No video URL in Kling result")
                        return {"ok": False, "error": "No video URL"}

                    # Final unit deduction (Kling may use unit_deduction, credit_used, units_used)
                    kling_units_used = data.get("unit_deduction") or data.get("credit_used") or data.get("units_used") or task_result.get("unit_deduction") or task_result.get("credit_used")
                    break
            except Exception as e:
                continue
        else:
            _fail(supabase, generation_id, "Kling timeout")
            return {"ok": False, "error": "Kling timeout"}

        download(kling_video_url, kling_path)

        # FFmpeg: -i kling -i audio -map 0:v -map 1:a -c:v copy -c:a aac synced.mp4
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(kling_path), "-i", str(audio_path), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", str(synced_path)],
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

        # Delete 3 input files from Storage
        inp_prefix = f"{INPUTS_PREFIX}/{generation_id}"
        for name in ["tracking.mp4", "target.jpg", "audio.mp3"]:
            try:
                supabase.storage.from_(BUCKET).remove([f"{inp_prefix}/{name}"])
            except Exception:
                pass

    return {"ok": True, "path": out_key, "kling_units_used": kling_units_used}


def _fail(supabase, generation_id: str, msg: str):
    supabase.table("generations").update({"status": "failed", "error_message": msg}).eq("id", generation_id).execute()
