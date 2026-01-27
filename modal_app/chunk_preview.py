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
    .pip_install("requests", "supabase", "fastapi", "starlette", "librosa", "audalign", "numpy", "scipy")
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
        video_raw_path = work_path / "video_raw.mp4"
        audio_raw_path = work_path / "audio_raw.wav"
        video_path = work_path / "video.mp4"
        audio_path = work_path / "audio.wav"
        
        # Download files
        print(f"[chunk-preview] Downloading video from {video_url}")
        r = requests.get(video_url, timeout=120)
        r.raise_for_status()
        video_raw_path.write_bytes(r.content)
        
        print(f"[chunk-preview] Downloading audio from {audio_url}")
        r = requests.get(audio_url, timeout=120)
        r.raise_for_status()
        audio_content = r.content
        audio_raw_path.write_bytes(audio_content)
        
        # Extract audio from MP4 if needed
        if audio_url.lower().endswith('.mp4'):
            audio_wav_path = work_path / "audio_extracted.wav"
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(audio_raw_path), "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(audio_wav_path)],
                check=True, capture_output=True
            )
            audio_raw_path = audio_wav_path
        
        # DO NOT trim video/audio - keep full files for preview
        # The sync_offset is only used to calculate where to extract audio chunks from master
        # In production, chunk 0 video is trimmed by sync_offset, but for preview we show original chunks
        print(f"[chunk-preview] Sync offset: {sync_offset:.3f}s (used for audio chunk timing, not for trimming)")
        video_path = video_raw_path
        audio_path = audio_raw_path
        
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
        # Skip last chunk if it would be less than 3 seconds
        MIN_CHUNK_DURATION = 3.0
        num_chunks_raw = ceil(video_duration / chunk_duration)
        last_chunk_start = (num_chunks_raw - 1) * chunk_duration
        last_chunk_duration = video_duration - last_chunk_start
        
        if last_chunk_duration < MIN_CHUNK_DURATION and num_chunks_raw > 1:
            # Skip the last chunk if it's too short
            num_chunks = int(num_chunks_raw - 1)
            print(f"[chunk-preview] Video: {video_duration:.2f}s, Audio: {audio_duration:.2f}s")
            print(f"[chunk-preview] Last chunk would be {last_chunk_duration:.2f}s (< {MIN_CHUNK_DURATION}s), skipping it")
            print(f"[chunk-preview] Processing {num_chunks} chunks (instead of {int(num_chunks_raw)})")
        else:
            num_chunks = int(num_chunks_raw)
            print(f"[chunk-preview] Video: {video_duration:.2f}s, Audio: {audio_duration:.2f}s, Chunks: {num_chunks}")
        
        chunks_dir = work_path / "chunks"
        chunks_dir.mkdir(exist_ok=True)
        
        chunk_previews = []
        # Use unique path for each request to avoid conflicts
        import time
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        storage_prefix = f"chunk_previews/{generation_id or 'temp'}/{unique_id}"
        
        for i in range(num_chunks):
            print(f"[chunk-preview] Processing chunk {i+1}/{num_chunks}...")
            
            # Calculate timing with sync_offset
            # Video chunks: sequential, starting at 0
            video_start_time = i * chunk_duration
            video_end_time = min(video_start_time + chunk_duration, video_duration)
            video_chunk_actual_duration = video_end_time - video_start_time
            
            # Audio timing: Match production logic in worker_loop.py
            # Chunk 0: Audio starts at 0 in master (video will be trimmed by sync_offset in production)
            # Chunk 1+: Audio starts where previous chunk audio ended in master
            if sync_offset and sync_offset > 0:
                if i == 0:
                    # Chunk 0: Audio extracted from 0 to chunk_duration
                    # In production, video is trimmed by sync_offset, so both start at 0
                    audio_start_time = 0
                else:
                    # Chunk 1+: Start where previous chunk audio ended in master
                    # If chunk 0 extracts 0-8s, chunk 1 starts at 8s
                    prev_audio_end = i * chunk_duration
                    audio_start_time = prev_audio_end
            else:
                # No sync offset: audio chunks match video chunks exactly
                audio_start_time = i * chunk_duration
            
            audio_end_time = audio_start_time + video_chunk_actual_duration
            
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
                 "-t", str(video_chunk_actual_duration), "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(audio_chunk_path)],
                check=True, capture_output=True
            )
            
            print(f"[chunk-preview] Chunk {i+1}: Video {video_start_time:.3f}s-{video_end_time:.3f}s, Audio {audio_start_time:.3f}s-{audio_end_time:.3f}s in master")
            
            # Upload video chunk
            # Use unique path to avoid conflicts, but if it still exists, try update
            video_storage_path = f"{storage_prefix}/video_chunk_{i:03d}.mp4"
            print(f"[chunk-preview] Uploading video chunk {i+1} to: {video_storage_path}")
            with open(video_chunk_path, "rb") as f:
                video_data = f.read()
                try:
                    supabase.storage.from_(BUCKET).upload(
                        video_storage_path, 
                        video_data, 
                        file_options={"content-type": "video/mp4"}
                    )
                except Exception as upload_error:
                    # Check if it's a duplicate error (409)
                    error_str = str(upload_error)
                    if "409" in error_str or "Duplicate" in error_str or "already exists" in error_str:
                        # File exists, try to update it
                        try:
                            supabase.storage.from_(BUCKET).update(
                                video_storage_path,
                                video_data,
                                file_options={"content-type": "video/mp4"}
                            )
                        except Exception as update_error:
                            print(f"[chunk-preview] Warning: Could not update video chunk {i+1}, trying to continue: {update_error}")
                            # Try to delete and re-upload
                            try:
                                supabase.storage.from_(BUCKET).remove([video_storage_path])
                                supabase.storage.from_(BUCKET).upload(
                                    video_storage_path,
                                    video_data,
                                    file_options={"content-type": "video/mp4"}
                                )
                            except Exception:
                                raise upload_error
                    else:
                        raise upload_error
            
            # Upload audio chunk
            audio_storage_path = f"{storage_prefix}/audio_chunk_{i:03d}.wav"
            print(f"[chunk-preview] Uploading audio chunk {i+1} to: {audio_storage_path}")
            with open(audio_chunk_path, "rb") as f:
                audio_data = f.read()
                try:
                    supabase.storage.from_(BUCKET).upload(
                        audio_storage_path,
                        audio_data,
                        file_options={"content-type": "audio/wav"}
                    )
                except Exception as upload_error:
                    # Check if it's a duplicate error (409)
                    error_str = str(upload_error)
                    if "409" in error_str or "Duplicate" in error_str or "already exists" in error_str:
                        # File exists, try to update it
                        try:
                            supabase.storage.from_(BUCKET).update(
                                audio_storage_path,
                                audio_data,
                                file_options={"content-type": "audio/wav"}
                            )
                        except Exception as update_error:
                            print(f"[chunk-preview] Warning: Could not update audio chunk {i+1}, trying to continue: {update_error}")
                            # Try to delete and re-upload
                            try:
                                supabase.storage.from_(BUCKET).remove([audio_storage_path])
                                supabase.storage.from_(BUCKET).upload(
                                    audio_storage_path,
                                    audio_data,
                                    file_options={"content-type": "audio/wav"}
                                )
                            except Exception:
                                raise upload_error
                    else:
                        raise upload_error
            
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
            
            # Debug: Verify URLs are correct
            print(f"[chunk-preview] Chunk {i+1} URLs created:")
            print(f"  - Video URL: {video_chunk_url[:80]}... (should be .mp4)")
            print(f"  - Audio URL: {audio_chunk_url[:80]}... (should be .wav)")
            
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
    # Import at function level (inside function to avoid deploy-time import errors)
    try:
        from fastapi import FastAPI, Request, HTTPException
        from fastapi.responses import JSONResponse
        from starlette.middleware.cors import CORSMiddleware
    except ImportError as e:
        raise ImportError(f"Failed to import FastAPI dependencies. Make sure fastapi and starlette are in pip_install. Error: {e}")
    
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
                
                # Calculate sync offset using manual cross-correlation (same as media_analyzer)
                print(f"[chunk-preview] Calculating sync offset using cross-correlation...")
                
                def calculate_sync_offset_manual(master_audio_path, video_audio_path):
                    """Manually calculate sync offset using cross-correlation."""
                    import numpy as np
                    from scipy import signal
                    
                    # Load both audio files at same sample rate
                    y_master, sr_master = librosa.load(str(master_audio_path), sr=22050)
                    y_video, sr_video = librosa.load(str(video_audio_path), sr=22050)
                    
                    # Use shorter length for correlation (first 30 seconds should be enough)
                    max_corr_length = min(len(y_master), len(y_video), int(30 * sr_master))
                    y_master_short = y_master[:max_corr_length]
                    y_video_short = y_video[:max_corr_length]
                    
                    print(f"[chunk-preview] Computing cross-correlation (video, master) - reverse order...")
                    print(f"[chunk-preview]   → Master: {len(y_master_short)/sr_master:.2f}s, Video: {len(y_video_short)/sr_video:.2f}s")
                    
                    # Compute cross-correlation in REVERSE order: (video, master)
                    # This should give correct sign for sync_offset
                    correlation = signal.correlate(y_video_short, y_master_short, mode='full')
                    
                    # Find peak correlation (best match point)
                    peak_index = np.argmax(np.abs(correlation))
                    center_index = len(y_master_short) - 1
                    offset_samples = peak_index - center_index
                    offset_seconds = offset_samples / sr_master
                    
                    print(f"[chunk-preview] Cross-correlation peak at index {peak_index} (center={center_index})")
                    print(f"[chunk-preview] Raw offset: {offset_samples} samples = {offset_seconds:.3f}s")
                    print(f"[chunk-preview] Interpreted sync_offset: {offset_seconds:.3f}s")
                    
                    return offset_seconds
                
                # Calculate manual offset
                manual_sync_offset = calculate_sync_offset_manual(audio_path, video_audio_path)
                print(f"[chunk-preview] Manual sync offset (cross-correlation): {manual_sync_offset:.3f}s")
                
                # Also get audalign result for comparison
                # IMPORTANT: Video audio is the TARGET (reference point)
                # We want to find when music starts in the video (dead space at start)
                try:
                    master_audio_dir = base / "master_audio_dir"
                    master_audio_dir.mkdir(exist_ok=True)
                    import shutil
                    master_audio_in_dir = master_audio_dir / "master_audio.wav"
                    shutil.copy2(str(audio_path), str(master_audio_in_dir))
                    
                    # Video audio is the TARGET (we want to match master audio to video)
                    alignment = audalign.target_align(str(video_audio_path), str(master_audio_dir))
                    
                    # Extract offset (try match_info first, then fallback)
                    raw_audalign_offset = None
                    if isinstance(alignment, dict) and "match_info" in alignment:
                        match_info = alignment["match_info"]
                        for target_file, target_info in match_info.items():
                            if isinstance(target_info, dict) and "match_info" in target_info:
                                for source_file, source_info in target_info["match_info"].items():
                                    if isinstance(source_info, dict) and "offset_seconds" in source_info:
                                        offsets = source_info["offset_seconds"]
                                        if offsets and len(offsets) > 0:
                                            raw_audalign_offset = float(offsets[0])
                                            break
                                if raw_audalign_offset is not None:
                                    break
                    
                    if raw_audalign_offset is None:
                        raw_audalign_offset = alignment.get("offset", 0.0)
                        if not isinstance(raw_audalign_offset, (int, float)):
                            raw_audalign_offset = float(raw_audalign_offset)
                    
                    # audalign appears to return doubled offset, divide by 2
                    audalign_sync_offset = raw_audalign_offset / 2.0
                    print(f"[chunk-preview] Audalign sync offset: {raw_audalign_offset:.3f}s (raw) → {audalign_sync_offset:.3f}s (divided by 2)")
                    print(f"[chunk-preview] Manual vs Audalign: {manual_sync_offset:.3f}s vs {audalign_sync_offset:.3f}s (diff: {abs(manual_sync_offset - audalign_sync_offset):.3f}s)")
                except Exception as e:
                    print(f"[chunk-preview] Audalign failed: {e}, using manual calculation only")
                    audalign_sync_offset = None
                
                # Use manual calculation as primary
                sync_offset = manual_sync_offset
                raw_sync_offset = audalign_sync_offset if audalign_sync_offset is not None else manual_sync_offset
                
                # Track onset detection info for UI display
                onset_detection_info = {
                    "used": False,
                    "audalign_offset": raw_sync_offset,  # Show audalign offset in UI (or manual if audalign failed)
                    "first_onset_time": None,
                    "reason": None
                }
                
                # Onset-based fallback: If manual calculation returns near-zero offset, detect first musical transient
                if abs(sync_offset) < 0.1:
                    print(f"[chunk-preview] Manual calculation returned near-zero offset ({sync_offset:.3f}s), checking for onset-based fallback...")
                    try:
                        # Load video audio and detect onsets
                        y_video, sr_video = librosa.load(str(video_audio_path), sr=22050)
                        onset_env = librosa.onset.onset_strength(y=y_video, sr=sr_video)
                        onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr_video, backtrack=True)
                        
                        if len(onset_frames) > 0:
                            first_onset_time = librosa.frames_to_time(onset_frames[0], sr=sr_video)
                            onset_detection_info["first_onset_time"] = float(first_onset_time)
                            print(f"[chunk-preview] First onset detected at {first_onset_time:.3f}s in video audio")
                            
                            # If first onset is > 0.3s, use it as offset (music starts later in video)
                            if first_onset_time > 0.3:
                                print(f"[chunk-preview] Using onset-based offset: {first_onset_time:.3f}s (music starts {first_onset_time:.3f}s into video)")
                                onset_detection_info["used"] = True
                                onset_detection_info["reason"] = f"First onset at {first_onset_time:.3f}s > 0.3s threshold"
                                sync_offset = first_onset_time
                            else:
                                print(f"[chunk-preview] First onset is too early ({first_onset_time:.3f}s), keeping audalign offset")
                                onset_detection_info["reason"] = f"First onset at {first_onset_time:.3f}s <= 0.3s threshold"
                        else:
                            print(f"[chunk-preview] No onsets detected in video audio, keeping audalign offset")
                            onset_detection_info["reason"] = "No onsets detected"
                    except Exception as e:
                        print(f"[chunk-preview] Onset detection failed: {e}, keeping audalign offset")
                        onset_detection_info["reason"] = f"Onset detection error: {str(e)[:100]}"
                
                # Interpret offset:
                # Positive offset = master audio starts BEFORE video audio (music in video starts later)
                # This means: music starts X seconds INTO the video (dead space at start)
                print(f"[chunk-preview] Final sync offset: {sync_offset:.3f}s")
                if sync_offset > 0:
                    print(f"[chunk-preview]   → Music starts {sync_offset:.3f}s INTO the video (dead space at start)")
                elif sync_offset < 0:
                    print(f"[chunk-preview]   → Video matches mid-song (audio needs trimming by {abs(sync_offset):.3f}s)")
                else:
                    print(f"[chunk-preview]   → Perfect sync (no offset needed)")
                
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
                "onset_detection": onset_detection_info,
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
