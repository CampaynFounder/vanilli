"""Media Analyzer: Fast analysis service for sync offset and tempo-based chunking."""
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, Optional, Tuple

import modal

app = modal.App("vannilli-media-analyzer")

# Image with librosa, audalign, scipy, and ffmpeg
img = modal.Image.debian_slim().apt_install("ffmpeg").pip_install(
    "librosa", "audalign", "numpy", "scipy", "supabase", "requests", "fastapi", "starlette"
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
    timeout=600,  # 10 minutes max (cross-correlation can take time for large files)
)
def analyze_media(
    job_id: Optional[str],
    video_url: str,
    audio_url: str,
    user_bpm: Optional[float] = None,
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
    
    # Get generation_id from job and update progress (only if job_id is provided)
    generation_id = None
    if job_id:
        try:
            job_data = supabase.table("video_jobs").select("generation_id").eq("id", job_id).single().execute()
            generation_id = job_data.data.get("generation_id") if job_data.data else None
            
            # Update generation: analysis starting (5%)
            if generation_id:
                supabase.table("generations").update({
                    "progress_percentage": 5,
                    "current_stage": "analyzing",
                }).eq("id", generation_id).execute()
        except Exception as e:
            # If job_id doesn't exist (debug mode), continue without DB updates
            print(f"[analyzer] Job ID not found (debug mode?): {e}")
    
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
        
        # 1. Calculate sync offset using manual cross-correlation (primary method)
        # This gives us full control and understanding of the calculation
        print("[analyzer] Calculating sync offset using cross-correlation...")
        
        def calculate_sync_offset_manual(master_audio_path, video_audio_path):
            """Manually calculate sync offset using cross-correlation.
            
            Returns:
                sync_offset: Positive means music starts LATER in video (dead space at start)
                            This is when music starts in video relative to master audio at 0s
            """
            import numpy as np
            from scipy import signal
            
            # Load both audio files at same sample rate
            print("[analyzer] Loading audio files for cross-correlation...")
            y_master, sr_master = librosa.load(str(master_audio_path), sr=22050)
            y_video, sr_video = librosa.load(str(video_audio_path), sr=22050)
            
            # Ensure same sample rate
            if sr_master != sr_video:
                raise ValueError(f"Sample rates don't match: master={sr_master}, video={sr_video}")
            
            # Use shorter length for correlation (first 15 seconds should be enough for sync offset)
            # This is much faster and sufficient to find when music starts
            max_corr_length = min(len(y_master), len(y_video), int(15 * sr_master))
            y_master_short = y_master[:max_corr_length]
            y_video_short = y_video[:max_corr_length]
            
            print(f"[analyzer] Computing cross-correlation (master: {len(y_master_short)/sr_master:.2f}s, video: {len(y_video_short)/sr_video:.2f}s)...")
            
            # Compute cross-correlation
            # This finds where video audio best matches master audio
            # Use 'full' mode to detect both positive and negative offsets
            print(f"[analyzer] Starting cross-correlation computation...")
            correlation = signal.correlate(y_master_short, y_video_short, mode='full')
            print(f"[analyzer] Cross-correlation completed, finding peak...")
            
            # Find peak correlation (best match point)
            peak_index = np.argmax(np.abs(correlation))
            
            # Convert peak index to time offset
            # correlation is 'full' mode, so indices range from -len(video) to +len(master)
            # Center is at len(video_short) - 1
            center_index = len(y_video_short) - 1
            offset_samples = peak_index - center_index
            offset_seconds = offset_samples / sr_master
            
            print(f"[analyzer] Cross-correlation peak at index {peak_index} (center={center_index})")
            print(f"[analyzer] Offset: {offset_samples} samples = {offset_seconds:.3f}s")
            
            # Interpret offset:
            # Positive offset_samples means video audio is shifted RIGHT relative to master
            # This means: master audio at 0s matches video audio at +offset_seconds
            # So music starts at +offset_seconds in the video (dead space before music)
            # Therefore: sync_offset = offset_seconds (positive = music starts later in video)
            
            sync_offset = offset_seconds
            
            # Also compute correlation strength for confidence
            max_corr_value = correlation[peak_index]
            norm_corr = max_corr_value / (np.linalg.norm(y_master_short) * np.linalg.norm(y_video_short))
            print(f"[analyzer] Correlation strength: {norm_corr:.4f} (1.0 = perfect match)")
            
            return sync_offset, norm_corr
        
        # Calculate manual offset
        manual_sync_offset, correlation_strength = calculate_sync_offset_manual(audio_path, video_audio_path)
        print(f"[analyzer] Manual sync offset (cross-correlation): {manual_sync_offset:.3f}s")
        
        # 2. Also get audalign result for comparison
        # IMPORTANT: Video audio is the TARGET (reference point)
        # We want to find when music starts in the video (dead space at start)
        # Master audio will be aligned to match the video audio
        print("[analyzer] Calculating sync offset with audalign for comparison...")
        master_audio_dir = base / "master_audio_dir"
        master_audio_dir.mkdir(exist_ok=True)
        import shutil
        master_audio_in_dir = master_audio_dir / "master_audio.wav"
        shutil.copy2(str(audio_path), str(master_audio_in_dir))
        
        try:
            # Video audio is the TARGET (we want to match master audio to video)
            # Result: master audio at X seconds matches video audio at 0 seconds
            # This means: music starts X seconds into the video (dead space before music)
            alignment = audalign.target_align(
                str(video_audio_path),  # video audio (TARGET - reference point)
                str(master_audio_dir),  # directory containing master audio to align
            )
            
            # Debug: Print full alignment result to understand structure
            print(f"[analyzer] Audalign full alignment result: {alignment}")
            print(f"[analyzer] Audalign alignment keys: {list(alignment.keys()) if isinstance(alignment, dict) else 'not a dict'}")
            
            # audalign.target_align() structure:
            # - First arg (video audio) is the TARGET (reference point)
            # - Second arg (master audio dir) contains files to align AGAINST the target
            # - Result: {target_file: offset, source_file: offset, match_info: {...}}
            # - The offset for the source file (master audio) tells us when it matches video audio
            # - If master audio offset is 6.64s, it means master audio at 6.64s matches video audio at 0s
            # - So music starts 6.64s into the video (dead space at start)
            # - sync_offset = offset of master audio (positive = music starts later in video)
            
            # Extract offset from match_info if available (more reliable)
            # Structure: match_info[target_file][match_info][source_file][offset_seconds]
            # Target = video_audio.wav, Source = master_audio.wav
            audalign_sync_offset = None
            if isinstance(alignment, dict) and "match_info" in alignment:
                match_info = alignment["match_info"]
                # Look for offset_seconds in match_info
                # Target file (video audio) will have match_info for source files (master audio)
                for target_file, target_info in match_info.items():
                    if isinstance(target_info, dict) and "match_info" in target_info:
                        # Source files (master audio) are in target_info["match_info"]
                        for source_file, source_info in target_info["match_info"].items():
                            if isinstance(source_info, dict) and "offset_seconds" in source_info:
                                offsets = source_info["offset_seconds"]
                                if offsets and len(offsets) > 0:
                                    # Use first offset (most confident match)
                                    # This is when master audio matches video audio at 0s
                                    raw_offset = float(offsets[0])
                                    # audalign appears to return doubled offset, divide by 2
                                    audalign_sync_offset = raw_offset / 2.0
                                    print(f"[analyzer] Extracted offset from match_info: {raw_offset:.3f}s (raw) → {audalign_sync_offset:.3f}s (divided by 2)")
                                    print(f"[analyzer]   → Master audio at {audalign_sync_offset:.3f}s matches video audio at 0s")
                                    print(f"[analyzer]   → Music starts {audalign_sync_offset:.3f}s into video (dead space at start)")
                                    break
                        if audalign_sync_offset is not None:
                            break
            
            # Fallback to top-level offset if match_info extraction failed
            if audalign_sync_offset is None:
                # Check if alignment has direct offset values
                # Structure: {target_file: offset, source_file: offset}
                # Source file (master audio) offset is what we want
                master_audio_key = None
                for key in alignment.keys():
                    if "audio" in key.lower() and "video" not in key.lower() and "master" in key.lower():
                        master_audio_key = key
                        break
                
                if master_audio_key and master_audio_key in alignment:
                    raw_offset = alignment[master_audio_key]
                    if not isinstance(raw_offset, (int, float)):
                        raw_offset = float(raw_offset)
                    # audalign appears to return doubled offset, divide by 2
                    audalign_sync_offset = raw_offset / 2.0
                    print(f"[analyzer] Extracted offset from top-level key '{master_audio_key}': {raw_offset:.3f}s (raw) → {audalign_sync_offset:.3f}s (divided by 2)")
                else:
                    # Last resort: try "offset" key
                    raw_offset = alignment.get("offset", 0.0)
                    if not isinstance(raw_offset, (int, float)):
                        raw_offset = float(raw_offset)
                    # audalign appears to return doubled offset, divide by 2
                    audalign_sync_offset = raw_offset / 2.0
                    print(f"[analyzer] Using fallback offset key: {raw_offset:.3f}s (raw) → {audalign_sync_offset:.3f}s (divided by 2)")
            
            print(f"[analyzer] Audalign sync offset (final): {audalign_sync_offset:.3f}s")
            print(f"[analyzer] Manual vs Audalign: {manual_sync_offset:.3f}s vs {audalign_sync_offset:.3f}s (diff: {abs(manual_sync_offset - audalign_sync_offset):.3f}s)")
            if abs(manual_sync_offset) > 0.01 and abs(audalign_sync_offset) > 0.01:
                ratio = manual_sync_offset / audalign_sync_offset
                print(f"[analyzer] Ratio (manual/audalign): {ratio:.2f}x")
        except Exception as e:
            print(f"[analyzer] Audalign failed: {e}, using manual calculation only")
            audalign_sync_offset = None
        
        # Use manual calculation as primary (we understand and control it)
        sync_offset = manual_sync_offset
        raw_sync_offset = audalign_sync_offset if audalign_sync_offset is not None else manual_sync_offset
        
        # Onset-based fallback: If manual calculation returns near-zero offset, detect first musical transient
        # This handles cases where cross-correlation fails to detect dead space at video start
        if abs(sync_offset) < 0.1:
            print(f"[analyzer] Manual calculation returned near-zero offset ({sync_offset:.3f}s), checking for onset-based fallback...")
            try:
                # Load video audio and detect onsets
                y_video, sr_video = librosa.load(str(video_audio_path), sr=22050)
                onset_env = librosa.onset.onset_strength(y=y_video, sr=sr_video)
                onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr_video, backtrack=True)
                
                if len(onset_frames) > 0:
                    first_onset_time = librosa.frames_to_time(onset_frames[0], sr=sr_video)
                    print(f"[analyzer] First onset detected at {first_onset_time:.3f}s in video audio")
                    
                    # If first onset is > 0.3s, use it as offset (music starts later in video)
                    if first_onset_time > 0.3:
                        print(f"[analyzer] Using onset-based offset: {first_onset_time:.3f}s (music starts {first_onset_time:.3f}s into video)")
                        sync_offset = first_onset_time
                        print(f"[analyzer] Onset offset ({first_onset_time:.3f}s) vs audalign offset ({raw_sync_offset:.3f}s) - ratio: {first_onset_time / raw_sync_offset if raw_sync_offset > 0 else 'N/A'}")
                    else:
                        print(f"[analyzer] First onset is too early ({first_onset_time:.3f}s), keeping audalign offset")
                else:
                    print(f"[analyzer] No onsets detected in video audio, keeping audalign offset")
            except Exception as e:
                print(f"[analyzer] Onset detection failed: {e}, keeping audalign offset")
        
        # Interpret offset:
        # Positive offset = master audio starts BEFORE video audio (music in video starts later)
        # This means: music starts X seconds INTO the video (dead space at start)
        # Negative offset = master audio starts AFTER video audio (video matches mid-song)
        print(f"[analyzer] Final sync offset: {sync_offset:.3f}s")
        if sync_offset > 0:
            print(f"[analyzer]   → Music starts {sync_offset:.3f}s INTO the video (dead space at start)")
            print(f"[analyzer]   → When muxing: delay audio by {sync_offset:.3f}s to align with music start")
        elif sync_offset < 0:
            print(f"[analyzer]   → Video matches mid-song (audio needs trimming by {abs(sync_offset):.3f}s)")
        else:
            print(f"[analyzer]   → Perfect sync (no offset needed)")
        
        # 2. Calculate BPM and measure grid
        # Use user-provided BPM if available, otherwise calculate with librosa
        if user_bpm is not None and user_bpm > 0:
            print(f"[analyzer] Using user-provided BPM: {user_bpm:.2f}")
            bpm = float(user_bpm)
            # Still calculate with librosa for comparison
            y, sr = librosa.load(str(audio_path), sr=22050)
            calculated_tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
            calculated_bpm = float(calculated_tempo)
            print(f"[analyzer] Calculated BPM (for comparison): {calculated_bpm:.2f}")
            print(f"[analyzer] User BPM vs Calculated: {bpm:.2f} vs {calculated_bpm:.2f} (diff: {abs(bpm - calculated_bpm):.2f})")
        else:
            print("[analyzer] No user BPM provided, calculating tempo with librosa...")
            y, sr = librosa.load(str(audio_path), sr=22050)
            tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
            bpm = float(tempo)
            print(f"[analyzer] Calculated BPM: {bpm:.2f}")
        
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
        
        # Update video_jobs with analysis results (only if job_id is provided)
        if job_id:
            try:
                job_data = supabase.table("video_jobs").select("generation_id").eq("id", job_id).single().execute()
                generation_id = job_data.data.get("generation_id") if job_data.data else None
                
                # Update video_jobs with analysis results
                supabase.table("video_jobs").update({
                    "sync_offset": sync_offset,
                    "bpm": bpm,
                    "chunk_duration": chunk_duration,
                    "analysis_status": "ANALYZED",
                    "status": "ANALYZED",
                }).eq("id", job_id).execute()
                
                # Update generation progress: analysis complete (10%)
                if generation_id:
                    supabase.table("generations").update({
                        "progress_percentage": 10,
                        "current_stage": "analyzing",
                    }).eq("id", generation_id).execute()
            except Exception as e:
                # If job_id doesn't exist (debug mode), continue without DB updates
                print(f"[analyzer] Job ID not found (debug mode?): {e}")
        
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
    max_containers=5,  # Max 5 concurrent analysis requests (updated from concurrency_limit)
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
        
        # Validate required fields (job_id is optional for debug/testing)
        job_id = data.get("job_id")
        video_url = data.get("video")
        audio_url = data.get("audio")
        
        if not all([video_url, audio_url]):
            return JSONResponse(
                {"error": "Missing required fields: video, audio"},
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
        
        # Get optional user-provided BPM from request body
        user_bpm = None
        if "bpm" in data and data["bpm"] is not None:
            try:
                user_bpm = float(data["bpm"])
                if user_bpm <= 0 or user_bpm > 300:
                    return JSONResponse(
                        {"error": "BPM must be between 1 and 300"},
                        status_code=400
                    )
                print(f"[analyzer] Received user-provided BPM: {user_bpm:.2f}")
            except (ValueError, TypeError):
                # BPM invalid format, will calculate it
                print(f"[analyzer] Invalid BPM format: {data.get('bpm')}, will calculate instead")
        
        # Start analysis (async - returns immediately, analysis runs in background)
        try:
            # Call the analysis function remotely (job_id can be None for debug)
            result = analyze_media.remote(job_id or "debug", video_url, audio_url, user_bpm)
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
