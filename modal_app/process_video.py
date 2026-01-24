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
img = modal.Image.debian_slim().apt_install("ffmpeg").pip_install("requests", "supabase", "starlette")

BUCKET = "vannilli"
INPUTS_PREFIX = "inputs"
OUTPUTS_PREFIX = "outputs"


@app.function(image=img, secrets=[modal.Secret.from_name("vannilli-secrets")], timeout=600)
@modal.web_endpoint(method="POST")
async def process_video(request: Request):
    """POST JSON: { tracking_video_url, target_image_url, audio_track_url, generation_id, is_trial }"""
    data = await request.json() or {}
    tracking_url = data.get("tracking_video_url")
    target_url = data.get("target_image_url")
    audio_url = data.get("audio_track_url")
    generation_id = data.get("generation_id")
    is_trial = data.get("is_trial", False)

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

        # Kling motion-control: driver_video + target_image
        payload = {
            "model_name": "kling-v2",
            "driver_video_url": tracking_url,
            "target_image_url": target_url,
            "mode": "standard",
            "character_orientation": "image",
        }
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
                st = (j.get("data") or {}).get("task_status")
                if st == "failed":
                    _fail(supabase, generation_id, j.get("message", "Kling failed"))
                    return {"ok": False, "error": "Kling failed"}
                if st == "succeed":
                    videos = (j.get("data") or {}).get("task_result") or {}
                    urls = (videos.get("videos") or [])
                    if not urls:
                        _fail(supabase, generation_id, "No video URL in Kling result")
                        return {"ok": False, "error": "No video URL"}
                    kling_video_url = urls[0].get("url")
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

        if is_trial:
            # Watermark
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

    return {"ok": True, "path": out_key}


def _fail(supabase, generation_id: str, msg: str):
    supabase.table("generations").update({"status": "failed", "error_message": msg}).eq("id", generation_id).execute()
