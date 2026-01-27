"""Modal function: Generate preview chunks for validation without sending to Kling."""
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, List, Optional
from math import ceil

import modal

app = modal.App("vannilli-chunk-preview")

# Same image as worker, but with FastAPI for web endpoint
# Also includes librosa and audalign for media analysis
img = (
    modal.Image.debian_slim()
    .apt_install("ffmpeg")
    .pip_install("requests", "supabase", "fastapi", "starlette", "librosa", "audalign", "numpy")
    .add_local_dir(Path(__file__).parent, remote_path="/root/modal_app")
)

BUCKET = "vannilli"


@app.function(
    image=img,
    secrets=[modal.Secret.from_name("vannilli-secrets")],
    timeout=600,  # 10 minutes max
)
def generate_chunk_previews(
    video_url: str,
    audio_url: str,
    sync_offset: float,
    chunk_duration: float,
    generation_id: Optional[str] = None,
    image_urls: Optional[List[str]] = None,
) -> Dict:
    """Generate preview chunks (video + audio) for validation.
    
    Args:
        video_url: URL to tracking video
        audio_url: URL to master audio
        sync_offset: Sync offset in seconds (from media_analyzer)
        chunk_duration: Chunk duration in seconds (from media_analyzer)
        generation_id: Optional generation ID for storage path
    
    Returns:
        {
            "video_duration": float,
            "audio_duration": float,
            "num_chunks": int,
            "chunks": [
                {
                    "chunk_index": int,
                    "video_chunk_url": str,  # Signed URL to video chunk
                    "audio_chunk_url": str,   # Signed URL to audio chunk
                    "video_start_time": float,
                    "video_end_time": float,
                    "audio_start_time": float,
                    "audio_end_time": float,
                },
                ...
            ]
        }
    """
    import requests
    from supabase import create_client
    
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    supabase = create_client(supabase_url, supabase_key)
    
    with tempfile.TemporaryDirectory() as work_dir:
        work_path = Path(work_dir)
        video_path = work_path / "video.mp4"
        audio_path = work_path / "audio.wav"
        
        # Download files
        print(f"[chunk-preview] Downloading video from {video_url}")
        r = requests.get(video_url, timeout=120)
        r.raise_for_status()
        video_path.write_bytes(r.content)
        
        print(f"[chunk-preview] Downloading audio from {audio_url}")
        r = requests.get(audio_url, timeout=120)
        r.raise_for_status()
        audio_content = r.content
        audio_path.write_bytes(audio_content)
        
        # Extract audio from MP4 if needed
        if audio_url.lower().endswith('.mp4'):
            audio_wav_path = work_path / "audio_extracted.wav"
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(audio_path), "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(audio_wav_path)],
                check=True, capture_output=True
            )
            audio_path = audio_wav_path
        
        # Get durations
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(video_path)],
            capture_output=True, text=True, check=True
        )
        video_duration = float(result.stdout.strip())
        
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)],
            capture_output=True, text=True, check=True
        )
        audio_duration = float(result.stdout.strip())
        
        # Calculate number of chunks
        num_chunks = int(ceil(video_duration / chunk_duration))
        print(f"[chunk-preview] Video: {video_duration:.2f}s, Audio: {audio_duration:.2f}s, Chunks: {num_chunks}")
        
        chunks_dir = work_path / "chunks"
        chunks_dir.mkdir(exist_ok=True)
        
        chunk_previews = []
        storage_prefix = f"chunk_previews/{generation_id or 'temp'}"
        
        for i in range(num_chunks):
            print(f"[chunk-preview] Processing chunk {i+1}/{num_chunks}...")
            
            # Calculate timing
            video_start_time = i * chunk_duration
            video_end_time = min(video_start_time + chunk_duration, video_duration)
            audio_start_time = video_start_time + sync_offset
            audio_end_time = audio_start_time + chunk_duration
            
            # Extract video chunk
            video_chunk_path = chunks_dir / f"video_chunk_{i:03d}.mp4"
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(video_path), "-ss", str(video_start_time), 
                 "-t", str(video_end_time - video_start_time), "-c", "copy", str(video_chunk_path)],
                check=True, capture_output=True
            )
            
            # Extract audio chunk
            audio_chunk_path = chunks_dir / f"audio_chunk_{i:03d}.wav"
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(audio_path), "-ss", str(audio_start_time), 
                 "-t", str(chunk_duration), "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(audio_chunk_path)],
                check=True, capture_output=True
            )
            
            # Upload video chunk
            video_storage_path = f"{storage_prefix}/video_chunk_{i:03d}.mp4"
            with open(video_chunk_path, "rb") as f:
                supabase.storage.from_(BUCKET).upload(
                    video_storage_path, 
                    f.read(), 
                    file_options={"content-type": "video/mp4"}
                )
            
            # Upload audio chunk
            audio_storage_path = f"{storage_prefix}/audio_chunk_{i:03d}.wav"
            with open(audio_chunk_path, "rb") as f:
                supabase.storage.from_(BUCKET).upload(
                    audio_storage_path,
                    f.read(),
                    file_options={"content-type": "audio/wav"}
                )
            
            # Get signed URLs (valid for 1 hour)
            video_signed = supabase.storage.from_(BUCKET).create_signed_url(video_storage_path, 3600)
            audio_signed = supabase.storage.from_(BUCKET).create_signed_url(audio_storage_path, 3600)
            
            # Handle different response formats
            if isinstance(video_signed, tuple):
                video_signed = video_signed[0] if video_signed else {}
            if isinstance(audio_signed, tuple):
                audio_signed = audio_signed[0] if audio_signed else {}
            
            video_chunk_url = (video_signed.get("signedUrl") or video_signed.get("signed_url")) if isinstance(video_signed, dict) else None
            audio_chunk_url = (audio_signed.get("signedUrl") or audio_signed.get("signed_url")) if isinstance(audio_signed, dict) else None
            
            if not video_chunk_url or not audio_chunk_url:
                raise Exception(f"Failed to create signed URLs for chunk {i+1}")
            
            # Get image URL for this chunk (rotate through images if provided)
            image_url = None
            image_index = None
            if image_urls and len(image_urls) > 0:
                image_index = i % len(image_urls)
                image_url = image_urls[image_index]
            
            chunk_previews.append({
                "chunk_index": i,
                "video_chunk_url": video_chunk_url,
                "audio_chunk_url": audio_chunk_url,
                "image_url": image_url,  # Optional image URL for this chunk
                "image_index": image_index,  # Optional image index (0-based)
                "video_start_time": video_start_time,
                "video_end_time": video_end_time,
                "audio_start_time": audio_start_time,
                "audio_end_time": audio_end_time,
            })
        
        return {
            "video_duration": video_duration,
            "audio_duration": audio_duration,
            "num_chunks": num_chunks,
            "chunks": chunk_previews,
        }


@app.function(
    image=img,
    secrets=[modal.Secret.from_name("vannilli-secrets")],
    timeout=300,
)
@modal.asgi_app()
def api():
    """FastAPI endpoint for chunk preview generation."""
    from fastapi import FastAPI, Request, HTTPException
    from fastapi.responses import JSONResponse
    from starlette.middleware.cors import CORSMiddleware
    
    web = FastAPI(
        title="VANNILLI Chunk Preview",
        description="Generate preview chunks for validation",
        version="1.0.0",
    )
    
    # CORS middleware - allow all origins for debug/testing
    # In production, you can restrict this via CORS_ORIGINS env var
    web.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allow all origins for debug page
        allow_credentials=False,  # Must be False when allow_origins=["*"]
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        max_age=3600,
    )
    
    @web.options("/")
    async def options_handler():
        """Handle OPTIONS preflight requests."""
        return JSONResponse({}, status_code=200)
    
    @web.post("/")
    async def generate_previews(req: Request):
        """Generate chunk previews for observability.
        
        Automatically calculates tempo, sync offset, and chunk duration from video/audio.
        
        Body:
        {
            "video_url": str,  # Required: URL to tracking video
            "audio_url": str,  # Required: URL to master audio
            "image_urls": [str]  # Optional: Array of image URLs
        }
        """
        try:
            data = await req.json()
            print(f"[chunk-preview] Received request with keys: {list(data.keys()) if isinstance(data, dict) else 'not a dict'}")
        except Exception as e:
            print(f"[chunk-preview] Error parsing JSON: {e}")
            return JSONResponse(
                {"error": f"Invalid JSON: {str(e)}"},
                status_code=400
            )
        
        # Accept both formats: video_url/audio_url OR video/audio (for backwards compatibility)
        video_url = data.get("video_url") or data.get("video") if isinstance(data, dict) else None
        audio_url = data.get("audio_url") or data.get("audio") if isinstance(data, dict) else None
        image_urls = data.get("image_urls", []) if isinstance(data, dict) else []  # Optional array of image URLs
        
        # Ignore job_id if provided (not needed for observability)
        job_id = data.get("job_id") if isinstance(data, dict) else None
        if job_id:
            print(f"[chunk-preview] Ignoring job_id: {job_id} (not needed for observability)")
        
        # Validate required fields
        if not video_url:
            print(f"[chunk-preview] Missing video_url/video. Received data: {data}")
            return JSONResponse(
                {"error": "Missing required field: video_url or video", "received_keys": list(data.keys()) if isinstance(data, dict) else "not a dict"},
                status_code=400
            )
        if not audio_url:
            print(f"[chunk-preview] Missing audio_url/audio. Received data: {data}")
            return JSONResponse(
                {"error": "Missing required field: audio_url or audio", "received_keys": list(data.keys()) if isinstance(data, dict) else "not a dict"},
                status_code=400
            )
        
        print(f"[chunk-preview] Analyzing media to calculate tempo and sync offset...")
        
        # Call media_analyzer to get sync_offset and chunk_duration
        # We'll inline the analysis logic here to avoid cross-app dependencies
        try:
            import requests
            import librosa
            import audalign
            import numpy as np
            import subprocess
            import tempfile
            from pathlib import Path
            
            print(f"[chunk-preview] Downloading media files for analysis...")
            
            with tempfile.TemporaryDirectory() as d:
                base = Path(d)
                video_path = base / "video.mp4"
                audio_path = base / "audio.wav"
                video_audio_path = base / "video_audio.wav"
                
                # Download files
                r = requests.get(video_url, timeout=120)
                r.raise_for_status()
                video_path.write_bytes(r.content)
                
                r = requests.get(audio_url, timeout=120)
                r.raise_for_status()
                audio_content = r.content
                audio_path.write_bytes(audio_content)
                
                # Extract audio from video for alignment
                subprocess.run(
                    ["ffmpeg", "-y", "-i", str(video_path), "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(video_audio_path)],
                    check=True, capture_output=True
                )
                
                # Calculate sync offset using audalign
                print(f"[chunk-preview] Calculating sync offset...")
                video_audio_dir = base / "video_audio_dir"
                video_audio_dir.mkdir(exist_ok=True)
                import shutil
                video_audio_in_dir = video_audio_dir / "video_audio.wav"
                shutil.copy2(str(video_audio_path), str(video_audio_in_dir))
                
                alignment = audalign.target_align(str(audio_path), str(video_audio_dir))
                sync_offset = alignment.get("offset", 0.0)
                if not isinstance(sync_offset, (int, float)):
                    sync_offset = float(sync_offset)
                
                # Calculate BPM using librosa
                print(f"[chunk-preview] Calculating tempo...")
                y, sr = librosa.load(str(audio_path), sr=22050)
                tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
                bpm = float(tempo)
                
                # Calculate chunk duration
                beats_per_second = bpm / 60.0
                seconds_per_beat = 60.0 / bpm
                seconds_per_measure = seconds_per_beat * 4
                target_duration = 9.0
                measures_per_chunk = max(1, int(target_duration / seconds_per_measure))
                chunk_duration = measures_per_chunk * seconds_per_measure
                
                if chunk_duration > 9.0:
                    measures_per_chunk -= 1
                    chunk_duration = measures_per_chunk * seconds_per_measure
                if chunk_duration < seconds_per_measure:
                    chunk_duration = seconds_per_measure
                
                print(f"[chunk-preview] Analysis complete: BPM={bpm:.2f}, sync_offset={sync_offset:.3f}s, chunk_duration={chunk_duration:.3f}s")
            
        except Exception as e:
            error_msg = str(e)[:500]
            print(f"[chunk-preview] Error analyzing media: {error_msg}")
            return JSONResponse(
                {"error": f"Failed to analyze media: {error_msg}"},
                status_code=500
            )
        
        # Generate chunk previews with calculated values
        try:
            result = generate_chunk_previews.remote(
                video_url=video_url,
                audio_url=audio_url,
                sync_offset=float(sync_offset),
                chunk_duration=float(chunk_duration),
                generation_id=None,  # Not needed for observability
                image_urls=image_urls if image_urls else None,
            )
            
            # Add analysis results to response
            result["analysis"] = {
                "bpm": bpm,
                "sync_offset": sync_offset,
                "chunk_duration": chunk_duration,
            }
            
            return JSONResponse(result)
        except Exception as e:
            error_msg = str(e)[:500]
            print(f"[chunk-preview] Error generating chunks: {error_msg}")
            return JSONResponse(
                {"error": error_msg},
                status_code=500
            )
    
    @web.get("/health")
    async def health():
        """Health check."""
        return JSONResponse({"status": "healthy", "service": "chunk-preview"})
    
    return web
