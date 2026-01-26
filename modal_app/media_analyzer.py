"""Media Analyzer: Fast analysis service for sync offset and tempo-based chunking."""
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, Optional, Tuple

import modal

app = modal.App("vannilli-media-analyzer")

# Image with librosa, audalign, and ffmpeg
img = modal.Image.debian_slim().apt_install("ffmpeg").pip_install(
    "librosa", "audalign", "numpy", "supabase", "requests", "fastapi", "starlette"
)


def get_video_duration(video_path: Path) -> float:
    """Get video duration in seconds using ffprobe."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(video_path)
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(result.stdout.strip())


def extract_audio_from_video(video_path: Path, output_path: Path):
    """Extract audio track from video file."""
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(video_path),
            "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
            str(output_path)
        ],
        check=True,
        capture_output=True,
    )


def extract_audio_from_mp4(audio_path: Path, output_path: Path):
    """Extract audio track from MP4 file (if it's a video file)."""
    # Check if it's actually a video file
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_type", "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)],
        capture_output=True,
        text=True,
    )
    if "audio" in result.stdout:
        # It has audio, extract it
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(audio_path),
                "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
                str(output_path)
            ],
            check=True,
            capture_output=True,
        )
    else:
        # No audio track, copy as-is (might be audio-only MP4)
        subprocess.run(["cp", str(audio_path), str(output_path)], check=True)


@app.function(
    image=img,
    secrets=[modal.Secret.from_name("vannilli-secrets")],
    timeout=300,  # 5 minutes max
)
def analyze_media(
    job_id: str,
    video_url: str,
    audio_url: str,
) -> Dict:
    """Analyze media files: calculate sync offset and tempo-based chunk duration.
    
    Returns:
        {
            "sync_offset": float,  # seconds (positive = master audio ahead of video)
            "bpm": float,  # beats per minute
            "chunk_duration": float,  # seconds (never > 9.0)
        }
    """
    import requests
    import librosa
    import audalign
    import numpy as np
    from supabase import create_client
    
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/") + "/"
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    supabase = create_client(supabase_url, supabase_key)
    
    with tempfile.TemporaryDirectory() as d:
        base = Path(d)
        video_path = base / "video.mp4"
        audio_path = base / "audio.wav"
        video_audio_path = base / "video_audio.wav"
        
        # Download files
        print(f"[analyzer] Downloading video from {video_url}")
        r = requests.get(video_url, timeout=120)
        r.raise_for_status()
        video_path.write_bytes(r.content)
        
        print(f"[analyzer] Downloading audio from {audio_url}")
        r = requests.get(audio_url, timeout=120)
        r.raise_for_status()
        audio_content = r.content
        audio_path.write_bytes(audio_content)
        
        # Check if audio is MP4 and extract if needed
        if audio_url.lower().endswith('.mp4'):
            audio_wav_path = base / "audio_extracted.wav"
            extract_audio_from_mp4(audio_path, audio_wav_path)
            audio_path = audio_wav_path
        
        # Extract audio from video for alignment
        print("[analyzer] Extracting audio from video...")
        extract_audio_from_video(video_path, video_audio_path)
        
        # 1. Calculate sync offset using audalign
        print("[analyzer] Calculating sync offset with audalign...")
        alignment = audalign.target_align(
            str(audio_path),  # master audio (target)
            str(video_audio_path),  # video audio (to align)
            technique="correlation",
        )
        sync_offset = alignment.get("offset", 0.0)
        if not isinstance(sync_offset, (int, float)):
            sync_offset = float(sync_offset)
        print(f"[analyzer] Sync offset: {sync_offset}s (master is {'ahead' if sync_offset > 0 else 'behind'} video)")
        
        # 2. Calculate BPM and measure grid using librosa
        print("[analyzer] Analyzing tempo with librosa...")
        y, sr = librosa.load(str(audio_path), sr=22050)
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo)
        
        # Calculate beats per second and seconds per beat
        beats_per_second = bpm / 60.0
        seconds_per_beat = 60.0 / bpm
        
        # 3. Calculate chunk duration based on tempo
        # Target: ~9 seconds, but align to measure boundaries
        # 4/4 time: 4 beats per measure
        seconds_per_measure = seconds_per_beat * 4
        
        # Find number of measures that gets us closest to 9s without exceeding
        target_duration = 9.0
        measures_per_chunk = max(1, int(target_duration / seconds_per_measure))
        chunk_duration = measures_per_chunk * seconds_per_measure
        
        # Ensure we never exceed 9 seconds
        if chunk_duration > 9.0:
            measures_per_chunk -= 1
            chunk_duration = measures_per_chunk * seconds_per_measure
        
        # Minimum chunk size: at least 1 measure
        if chunk_duration < seconds_per_measure:
            chunk_duration = seconds_per_measure
        
        print(f"[analyzer] BPM: {bpm:.2f}, Measures per chunk: {measures_per_chunk}, Chunk duration: {chunk_duration:.2f}s")
        
        # Update video_jobs with analysis results
        supabase.table("video_jobs").update({
            "sync_offset": sync_offset,
            "bpm": bpm,
            "chunk_duration": chunk_duration,
            "analysis_status": "ANALYZED",
            "status": "ANALYZED",
        }).eq("id", job_id).execute()
        
        return {
            "sync_offset": sync_offset,
            "bpm": bpm,
            "chunk_duration": chunk_duration,
        }


@app.function(
    image=img,
    secrets=[modal.Secret.from_name("vannilli-secrets")],
    timeout=300,  # 5 minutes max (analysis can take time for long videos)
    cpu=2,  # 2 CPUs for librosa/audalign processing
    memory=4096,  # 4GB RAM (librosa can be memory-intensive)
    concurrency_limit=5,  # Max 5 concurrent analysis requests
)
@modal.asgi_app()
def api():
    """FastAPI web endpoint for Supabase Edge Function to call.
    
    Parameters:
    - timeout: 300s (5 minutes) - max time for analysis
    - cpu: 2 cores - for librosa/audalign processing
    - memory: 4GB - librosa can be memory-intensive
    - concurrency_limit: 5 - max concurrent requests
    """
    from fastapi import FastAPI, Request, Header, HTTPException
    from fastapi.responses import JSONResponse
    from starlette.middleware.cors import CORSMiddleware
    from typing import Optional
    
    web = FastAPI(
        title="VANNILLI Media Analyzer",
        description="Analyzes video/audio for sync offset and tempo-based chunking",
        version="1.0.0",
    )
    
    # CORS middleware - restrict to Supabase origins in production
    allowed_origins = os.environ.get("CORS_ORIGINS", "*").split(",") if os.environ.get("CORS_ORIGINS") else ["*"]
    web.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["POST", "OPTIONS"],
        allow_headers=["*"],
        max_age=3600,
    )
    
    @web.post("/")
    async def webhook(
        req: Request,
        authorization: Optional[str] = Header(None),
        content_type: Optional[str] = Header(None),
    ):
        """Webhook endpoint for job analysis.
        
        Headers:
        - Authorization: Optional API key (if MODAL_WEBHOOK_SECRET is set)
        - Content-Type: application/json (required)
        
        Body:
        - job_id: UUID of the video_job
        - video: URL to user video file
        - audio: URL to master audio file
        """
        # Optional API key authentication
        webhook_secret = os.environ.get("MODAL_WEBHOOK_SECRET")
        if webhook_secret:
            if not authorization or authorization != f"Bearer {webhook_secret}":
                return JSONResponse(
                    {"error": "Unauthorized - invalid API key"},
                    status_code=401
                )
        
        # Validate Content-Type
        if content_type and "application/json" not in content_type:
            return JSONResponse(
                {"error": "Content-Type must be application/json"},
                status_code=400
            )
        
        # Parse request body
        try:
            data = await req.json()
        except Exception as e:
            return JSONResponse(
                {"error": f"Invalid JSON: {str(e)}"},
                status_code=400
            )
        
        # Validate required fields
        job_id = data.get("job_id")
        video_url = data.get("video")
        audio_url = data.get("audio")
        
        if not all([job_id, video_url, audio_url]):
            return JSONResponse(
                {"error": "Missing required fields: job_id, video, audio"},
                status_code=400
            )
        
        # Validate URLs are valid
        if not (video_url.startswith("http://") or video_url.startswith("https://")):
            return JSONResponse(
                {"error": "Invalid video URL format"},
                status_code=400
            )
        if not (audio_url.startswith("http://") or audio_url.startswith("https://")):
            return JSONResponse(
                {"error": "Invalid audio URL format"},
                status_code=400
            )
        
        # Start analysis (async - returns immediately, analysis runs in background)
        try:
            # Call the analysis function remotely
            result = analyze_media.remote(job_id, video_url, audio_url)
            return JSONResponse({
                "status": "Analysis Complete",
                "job_id": job_id,
                **result
            })
        except Exception as e:
            error_msg = str(e)[:500]  # Limit error message length
            print(f"[analyzer] Error: {error_msg}")
            
            # Update job status to failed
            try:
                from supabase import create_client
                supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/") + "/"
                supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
                supabase = create_client(supabase_url, supabase_key)
                supabase.table("video_jobs").update({
                    "analysis_status": "FAILED",
                    "status": "FAILED",
                    "error_message": error_msg,
                }).eq("id", job_id).execute()
            except Exception as db_error:
                print(f"[analyzer] Failed to update DB: {db_error}")
            
            return JSONResponse(
                {"error": error_msg, "job_id": job_id},
                status_code=500
            )
    
    @web.get("/health")
    async def health():
        """Health check endpoint."""
        return JSONResponse({"status": "healthy", "service": "media-analyzer"})
    
    return web
