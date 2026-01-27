"""Modal worker loop: Processes video jobs from queue with tier-based priority."""
import os
import sys
import time
from pathlib import Path

import modal

# Import from same directory (only needed at runtime, not deploy time)
# These will be available in the Modal container

app = modal.App("vannilli-video-worker")

# Updated image with audalign for audio alignment
# ffprobe is included in ffmpeg package, no need to install separately
# Add modal_app directory to image so all Python files are available
img = (
    modal.Image.debian_slim()
    .apt_install("ffmpeg")
    .pip_install("requests", "supabase", "audalign", "pyjwt", "librosa", "numpy")
    .add_local_dir(Path(__file__).parent, remote_path="/root/modal_app")
)

BUCKET = "vannilli"
OUTPUTS_PREFIX = "outputs"


def get_kling_bearer() -> str:
    """Get Kling bearer token (JWT or API key)."""
    import jwt
    
    kling_base = os.environ.get("KLING_API_URL", "https://api.klingai.com/v1")
    def _k(v): return (v or "").strip() or None
    
    kling_access = _k(os.environ.get("KLING_ACCESS_KEY"))
    kling_secret = _k(os.environ.get("KLING_SECRET_KEY") or os.environ.get("KLING_API_KEY"))
    kling_api_key = _k(os.environ.get("KLING_API_KEY"))
    
    if kling_access and kling_secret:
        now = int(time.time())
        payload = {"iss": kling_access, "exp": now + 1800, "nbf": now - 5}
        headers = {"alg": "HS256", "typ": "JWT"}
        tok = jwt.encode(payload, kling_secret, algorithm="HS256", headers=headers)
        return tok.decode("utf-8") if isinstance(tok, bytes) else tok
    elif kling_api_key:
        return kling_api_key
    else:
        raise Exception("Kling credentials not configured")


@app.function(
    image=img,
    secrets=[modal.Secret.from_name("vannilli-secrets")],
    schedule=modal.Period(seconds=10),  # Run every 10 seconds
    timeout=1800,  # 30 minutes max (for Industry tier 90s jobs)
)
def worker_loop():
    """Main worker loop: Fetches and processes jobs from queue."""
    # Import at runtime (inside function) to avoid deploy-time import errors
    # These modules will be available in the Modal container via the mount
    import sys
    from pathlib import Path
    
    # Add mounted modal_app directory to path
    modal_app_dir = Path("/root/modal_app")
    if str(modal_app_dir) not in sys.path:
        sys.path.insert(0, str(modal_app_dir))
    
    # Also try the current file's directory (fallback)
    current_dir = Path(__file__).parent
    if str(current_dir) not in sys.path:
        sys.path.insert(0, str(current_dir))
    
    from job_queue_manager import JobQueueManager
    from video_orchestrator import VideoProductionOrchestrator, KlingClient
    from supabase import create_client
    
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    kling_base = os.environ.get("KLING_API_URL", "https://api.klingai.com/v1")
    
    if not supabase_url or not supabase_key:
        print("[worker] Missing Supabase configuration")
        return
    
    supabase = create_client(supabase_url, supabase_key)
    queue_manager = JobQueueManager(supabase_url, supabase_key)
    
    # 1. CHECK CONCURRENCY
    limit = queue_manager.get_concurrency_limit()
    current_active = queue_manager.get_active_job_count()
    
    if current_active >= limit:
        print(f"[worker] System saturated ({current_active}/{limit}). Waiting.")
        return
    
    # 2. FETCH NEXT PRIORITY JOB
    job = queue_manager.fetch_next_job()
    if not job:
        print("[worker] Queue empty.")
        return
    
    job_id = job["id"]
    user_tier = job["tier"]
    generation_id = job.get("generation_id")
    analysis_status = job.get("analysis_status", "PENDING_ANALYSIS")
    sync_offset = job.get("sync_offset")
    chunk_duration = job.get("chunk_duration")
    
    print(f"[worker] Processing job {job_id} (tier: {user_tier}, generation: {generation_id}, analysis: {analysis_status})")
    
    # Check if generation was cancelled
    if generation_id:
        gen_check = supabase.table("generations").select("status").eq("id", generation_id).single().execute()
        if gen_check.data and gen_check.data.get("status") == "cancelled":
            print(f"[worker] Generation {generation_id} was cancelled. Skipping job {job_id}.")
            queue_manager.mark_job_failed(job_id, "Cancelled by user")
            return
    
    # If job needs analysis, skip (analyzer service handles it)
    if analysis_status != "ANALYZED" and (user_tier == "demo" or user_tier == "industry"):
        print(f"[worker] Job {job_id} needs analysis first. Skipping.")
        return
    
    try:
        # Initialize Kling client
        kling_bearer = get_kling_bearer()
        kling_client = KlingClient(kling_base, kling_bearer)
        
        # Initialize orchestrator
        orchestrator = VideoProductionOrchestrator(kling_client, user_tier, supabase)
        
        # Process job
        user_video_url = job["user_video_url"]
        master_audio_url = job["master_audio_url"]
        target_images = job["target_images"] or []
        prompt = job.get("prompt")
        
        if not target_images:
            raise Exception("No target images provided")
        
        print(f"[worker] Starting video processing (images: {len(target_images)}, sync_offset: {sync_offset}, chunk_duration: {chunk_duration})...")
        
        # Update generation status to processing
        if generation_id:
            supabase.table("generations").update({
                "status": "processing",
                "current_stage": "analyzing" if (user_tier == "demo" or user_tier == "industry") else "processing",
                "progress_percentage": 5,
            }).eq("id", generation_id).execute()
        
        # Process with chunk-level tracking for DEMO/Industry tiers
        use_chunk_tracking = (user_tier == "demo" or user_tier == "industry") and chunk_duration is not None
        
        if use_chunk_tracking:
            # Chunk-level processing with individual tracking
            final_video_path = process_job_with_chunks(
                orchestrator, supabase, job_id, generation_id,
                user_video_url, master_audio_url, target_images, prompt,
                sync_offset, chunk_duration, user_tier, kling_client
            )
        else:
            # Legacy single-chunk processing
            final_video_path = orchestrator.process_job(
                user_video_url=user_video_url,
                master_audio_url=master_audio_url,
                images=target_images,
                prompt=prompt,
                generation_id=generation_id,
                job_id=job_id,
                sync_offset=sync_offset,
                chunk_duration=chunk_duration,
            )
        
        # Upload final video to Supabase Storage
        output_key = f"{OUTPUTS_PREFIX}/{generation_id or job_id}/final.mp4"
        print(f"[worker] Uploading final video to {output_key}...")
        
        with open(final_video_path, "rb") as f:
            supabase.storage.from_(BUCKET).upload(output_key, f.read(), file_options={"content-type": "video/mp4"})
        
        # Get public/signed URL
        signed_url_data = supabase.storage.from_(BUCKET).create_signed_url(output_key, 3600)
        if isinstance(signed_url_data, tuple):
            signed_url_data = signed_url_data[0] if signed_url_data else {}
        output_url = (signed_url_data.get("signedUrl") or signed_url_data.get("signed_url")) if isinstance(signed_url_data, dict) else None
        
        if not output_url:
            output_url = f"{supabase_url}/storage/v1/object/public/{BUCKET}/{output_key}"
        
        # Update job status
        queue_manager.mark_job_complete(job_id, output_url)
        
        # Update generation record if linked
        if generation_id:
            completed_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            supabase.table("generations").update({
                "status": "completed",
                "final_video_r2_path": output_key,
                "completed_at": completed_time,
                "progress_percentage": 100,
                "current_stage": "completed",
                "estimated_completion_at": None,  # Clear estimate when done
            }).eq("id", generation_id).execute()
            
            gen_data = supabase.table("generations").select("project_id").eq("id", generation_id).single().execute()
            if gen_data.data and gen_data.data.get("project_id"):
                supabase.table("projects").update({"status": "completed"}).eq("id", gen_data.data["project_id"]).execute()
        
        print(f"[worker] Job {job_id} completed successfully")
        
    except Exception as e:
        error_msg = str(e)[:500]
        print(f"[worker] Job {job_id} failed: {error_msg}")
        queue_manager.mark_job_failed(job_id, error_msg)
        
        if generation_id:
            supabase.table("generations").update({
                "status": "failed",
                "error_message": error_msg,
            }).eq("id", generation_id).execute()
            
            gen_data = supabase.table("generations").select("project_id").eq("id", generation_id).single().execute()
            if gen_data.data and gen_data.data.get("project_id"):
                supabase.table("projects").update({"status": "failed"}).eq("id", gen_data.data["project_id"]).execute()


def process_job_with_chunks(
    orchestrator, supabase, job_id, generation_id,
    user_video_url, master_audio_url, target_images, prompt,
    sync_offset, chunk_duration, user_tier, kling_client
):
    """Process job with chunk-level tracking for DEMO/Industry tiers."""
    import requests
    import subprocess
    import tempfile
    import time
    from pathlib import Path
    from math import ceil
    
    with tempfile.TemporaryDirectory() as work_dir:
        work_path = Path(work_dir)
        user_video_raw_path = work_path / "user_video_raw.mp4"
        master_audio_raw_path = work_path / "master_audio_raw.wav"
        user_video_path = work_path / "user_video.mp4"
        master_audio_path = work_path / "master_audio.wav"
        
        # Download files
        print(f"[worker] Downloading video from {user_video_url}")
        r = requests.get(user_video_url, timeout=120)
        r.raise_for_status()
        user_video_raw_path.write_bytes(r.content)
        
        print(f"[worker] Downloading audio from {master_audio_url}")
        r = requests.get(master_audio_url, timeout=120)
        r.raise_for_status()
        audio_content = r.content
        master_audio_raw_path.write_bytes(audio_content)
        
        # Extract audio from MP4 if needed
        if master_audio_url.lower().endswith('.mp4'):
            import subprocess
            audio_wav_path = work_path / "audio_extracted.wav"
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(master_audio_raw_path), "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(audio_wav_path)],
                check=True, capture_output=True
            )
            master_audio_raw_path = audio_wav_path
        
        # DO NOT trim video/audio - keep full files
        # The sync_offset will be used when muxing final video with audio
        # Positive offset = music starts X seconds into video (dead space at start)
        # We'll shift the audio to the right by offset amount when muxing
        print(f"[worker] Sync offset: {sync_offset:.3f}s (will be applied when muxing final video)")
        print(f"[worker] Positive offset = music starts {sync_offset:.3f}s into video (dead space at start)")
        print(f"[worker] Negative offset = video matches mid-song (audio needs trimming)")
        
        # Use original files (no trimming)
        user_video_path = user_video_raw_path
        master_audio_path = master_audio_raw_path
        
        # Get video duration
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(user_video_path)],
            capture_output=True, text=True, check=True
        )
        duration = float(result.stdout.strip())
        
        # Calculate number of chunks
        num_chunks = int(ceil(duration / chunk_duration))
        print(f"[worker] Processing {num_chunks} chunks with duration {chunk_duration:.2f}s each")
        
        # Create chunk records
        chunk_records = []
        for i in range(num_chunks):
            try:
                chunk_data = supabase.table("video_chunks").insert({
                    "job_id": job_id,
                    "generation_id": generation_id,
                    "chunk_index": i,
                    "status": "PENDING",
                }).execute()
                chunk_records.append(chunk_data.data[0] if chunk_data.data else None)
            except Exception as e:
                print(f"[worker] Failed to create chunk record {i}: {e}")
                chunk_records.append(None)
        
        chunks_dir = work_path / "chunks"
        chunks_dir.mkdir(exist_ok=True)
        final_segments = []
        
        # Calculate estimated completion time (rough estimate: 60-90 seconds per chunk)
        import datetime
        estimated_seconds_per_chunk = 75  # Average processing time per chunk
        estimated_total_seconds = num_chunks * estimated_seconds_per_chunk
        estimated_completion = datetime.datetime.utcnow() + datetime.timedelta(seconds=estimated_total_seconds)
        
        # Update generation: set status to processing and estimated completion
        if generation_id:
            supabase.table("generations").update({
                "status": "processing",
                "current_stage": "processing_chunks",
                "progress_percentage": 10,  # Analysis complete, starting chunks
                "estimated_completion_at": estimated_completion.strftime("%Y-%m-%dT%H:%M:%SZ"),
            }).eq("id", generation_id).execute()
        
        # Process each chunk
        for i in range(num_chunks):
            # Check if generation was cancelled before processing each chunk
            if generation_id:
                gen_check = supabase.table("generations").select("status").eq("id", generation_id).single().execute()
                if gen_check.data and gen_check.data.get("status") == "cancelled":
                    print(f"[worker] Generation {generation_id} was cancelled. Stopping chunk processing.")
                    # Mark remaining chunks as failed
                    for j in range(i, num_chunks):
                        if chunk_records[j] and chunk_records[j].get("id"):
                            supabase.table("video_chunks").update({
                                "status": "FAILED",
                                "error_message": "Cancelled by user",
                            }).eq("id", chunk_records[j]["id"]).execute()
                    raise Exception("Generation cancelled by user")
            
            chunk_id = chunk_records[i]["id"] if chunk_records[i] else None
            print(f"[worker] Processing chunk {i+1}/{num_chunks}...")
            
            try:
                # Update chunk status
                if chunk_id:
                    supabase.table("video_chunks").update({
                        "status": "PROCESSING"
                    }).eq("id", chunk_id).execute()
                
                # Update generation progress: 10% (analysis) + 80% (chunks) + 10% (finalizing)
                if generation_id:
                    chunk_progress = 10 + int((i / num_chunks) * 80)
                    supabase.table("generations").update({
                        "progress_percentage": chunk_progress,
                        "current_stage": "processing_chunks",
                    }).eq("id", generation_id).execute()
                
                # Split video chunk
                start_time = i * chunk_duration
                chunk_path = chunks_dir / f"chunk_{i:03d}.mp4"
                subprocess.run(
                    ["ffmpeg", "-y", "-i", str(user_video_path), "-ss", str(start_time), "-t", str(chunk_duration), "-c", "copy", str(chunk_path)],
                    check=True, capture_output=True
                )
                
                # Upload chunk for Kling
                chunk_storage_path = f"temp_chunks/{job_id}/chunk_{i:03d}.mp4"
                with open(chunk_path, "rb") as f:
                    supabase.storage.from_("vannilli").upload(chunk_storage_path, f.read(), file_options={"content-type": "video/mp4"})
                
                signed_url_result = supabase.storage.from_("vannilli").create_signed_url(chunk_storage_path, 3600)
                if isinstance(signed_url_result, tuple):
                    signed_url_result = signed_url_result[0] if signed_url_result else {}
                chunk_url = (signed_url_result.get("signedUrl") or signed_url_result.get("signed_url")) if isinstance(signed_url_result, dict) else None
                
                if not chunk_url:
                    raise Exception(f"Failed to create signed URL for chunk {i+1}")
                
                # Calculate timing information for observability
                # sync_offset represents when music starts in the video
                # Positive offset = music starts X seconds into video (dead space at start)
                # This shifts ALL audio chunks to the right by sync_offset in the video timeline
                # Master audio starts at 0, no offset needed
                video_chunk_start_time = i * chunk_duration
                video_chunk_end_time = min(video_chunk_start_time + chunk_duration, duration)
                video_chunk_actual_duration = video_chunk_end_time - video_chunk_start_time
                
                # Audio timing: All chunks are shifted by sync_offset
                # Pattern: Each chunk audio starts where previous chunk audio ended
                # Chunk 0: Audio 0 to chunk_duration (delayed by sync_offset when muxing)
                # Chunk 1: Audio starts at (chunk_duration - sync_offset), continues for chunk_duration
                # Chunk 2+: Audio starts where previous chunk audio ended (sequential)
                if sync_offset and sync_offset > 0:
                    if i == 0:
                        # Chunk 0: Start at 0 in master audio, delay by sync_offset when muxing
                        audio_start_time = 0
                    elif i == 1:
                        # Chunk 1: Starts at (chunk_duration - sync_offset) = (8 - 2) = 6s
                        # This is where chunk 0 audio effectively ends after accounting for offset
                        audio_start_time = chunk_duration - sync_offset
                    else:
                        # Chunk 2+: Start where previous chunk audio ended
                        # Previous chunk (i-1) audio start = chunk_duration - sync_offset (if i-1 == 1) or calculated recursively
                        # For i=2: prev_start = chunk_duration - sync_offset, prev_end = prev_start + chunk_duration
                        # For i>2: prev_start = (i-1) * chunk_duration - sync_offset, prev_end = prev_start + chunk_duration
                        if i == 2:
                            prev_audio_start = chunk_duration - sync_offset
                            prev_audio_end = prev_audio_start + chunk_duration
                            audio_start_time = prev_audio_end
                        else:
                            # i > 2: Use formula (i * chunk_duration) - sync_offset
                            audio_start_time = (i * chunk_duration) - sync_offset
                    audio_duration = video_chunk_actual_duration
                else:
                    # No sync offset: audio chunks match video chunks exactly
                    audio_start_time = i * chunk_duration
                    audio_duration = video_chunk_actual_duration
                
                image_index = i % len(target_images)
                current_image = target_images[image_index]
                
                # Log chunk details before calling Kling
                kling_requested_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                print(f"[worker] Chunk {i+1}/{num_chunks} observability:")
                print(f"  - Video chunk: {video_chunk_start_time:.3f}s to {video_chunk_end_time:.3f}s (duration: {video_chunk_actual_duration:.3f}s)")
                print(f"  - Audio chunk: {audio_start_time:.3f}s to {audio_start_time + audio_duration:.3f}s (duration: {audio_duration:.3f}s) in master audio")
                if sync_offset and sync_offset > 0:
                    if i == 0:
                        print(f"  - Chunk 0: Audio starts at 0s, will be delayed by {sync_offset:.3f}s when muxing (shifts audio right by {sync_offset:.3f}s)")
                    elif i == 1:
                        print(f"  - Chunk 1: Audio starts at {audio_start_time:.3f}s (chunk_duration {chunk_duration:.3f}s - sync_offset {sync_offset:.3f}s)")
                    else:
                        prev_audio_end = (chunk_duration - sync_offset) + chunk_duration if i == 2 else ((i-1) * chunk_duration - sync_offset) + chunk_duration
                        print(f"  - Chunk {i}: Audio starts at {audio_start_time:.3f}s (where chunk {i-1} audio ended: {prev_audio_end:.3f}s)")
                print(f"  - Image index: {image_index}/{len(target_images)-1}, URL: {current_image}")
                print(f"  - Video chunk URL: {chunk_url[:80]}...")
                
                # Call Kling
                task_id = kling_client.generate(chunk_url, current_image, prompt)
                kling_completed_at = None
                status, kling_video_url = kling_client.poll_status(task_id)
                kling_completed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                
                if status != "succeed" or not kling_video_url:
                    raise Exception(f"Kling generation failed for chunk {i+1}")
                
                print(f"[worker] Chunk {i+1}/{num_chunks} Kling completed:")
                print(f"  - Task ID: {task_id}")
                print(f"  - Kling video URL: {kling_video_url[:80]}...")
                print(f"  - Requested at: {kling_requested_at}")
                print(f"  - Completed at: {kling_completed_at}")
                
                # Download Kling output
                kling_output_path = chunks_dir / f"kling_chunk_{i:03d}.mp4"
                r = requests.get(kling_video_url, timeout=120)
                r.raise_for_status()
                kling_output_path.write_bytes(r.content)
                
                # Extract audio slice (audio_start_time and audio_duration already calculated above)
                audio_slice_path = chunks_dir / f"audio_chunk_{i:03d}.wav"
                subprocess.run(
                    ["ffmpeg", "-y", "-i", str(master_audio_path), "-ss", str(audio_start_time), "-t", str(audio_duration),
                     "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(audio_slice_path)],
                    check=True, capture_output=True
                )
                
                # Mux video + audio
                # Apply sync_offset: if positive, delay audio to align with when music starts in video
                # Positive offset = music starts X seconds into video, so delay audio by X seconds
                segment_path = chunks_dir / f"segment_{i:03d}.mp4"
                
                # Mux video + audio
                # With positive sync_offset: all audio is shifted right by sync_offset
                # Chunk 0: Delay audio by sync_offset to align with music start in video
                # Chunk 1+: Audio already shifted in master audio, no delay needed (aligns naturally)
                if i == 0 and sync_offset and sync_offset > 0:
                    # Chunk 0: Delay audio by sync_offset to align with when music starts in video
                    print(f"[worker] Chunk 0: Delaying audio by {sync_offset:.3f}s to align with music start")
                    delay_ms = int(sync_offset * 1000)
                    subprocess.run(
                        ["ffmpeg", "-y",
                         "-i", str(kling_output_path),  # Video from Kling
                         "-i", str(audio_slice_path),   # Audio slice (0 to chunk_duration from master)
                         "-filter_complex", f"[1:a]adelay={delay_ms}|{delay_ms}[a]",
                         "-map", "0:v:0", "-map", "[a]",
                         "-c:v", "libx264", "-preset", "veryfast",
                         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
                         "-movflags", "+faststart",
                         "-shortest", str(segment_path)],
                        check=True, capture_output=True
                    )
                else:
                    # Subsequent chunks: Audio already shifted in master audio (e.g., chunk 1 at 6s, chunk 2 at 14s)
                    # No delay needed, aligns naturally with video
                    subprocess.run(
                        ["ffmpeg", "-y", "-i", str(kling_output_path), "-i", str(audio_slice_path),
                         "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "veryfast",
                         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
                         "-shortest", str(segment_path)],
                        check=True, capture_output=True
                    )
                
                # Upload individual chunk for preview/download
                chunk_output_key = f"{OUTPUTS_PREFIX}/{generation_id or job_id}/chunk_{i:03d}.mp4"
                with open(segment_path, "rb") as f:
                    supabase.storage.from_(BUCKET).upload(chunk_output_key, f.read(), file_options={"content-type": "video/mp4"})
                
                signed_chunk_url = supabase.storage.from_(BUCKET).create_signed_url(chunk_output_key, 3600)
                if isinstance(signed_chunk_url, tuple):
                    signed_chunk_url = signed_chunk_url[0] if signed_chunk_url else {}
                chunk_video_url = (signed_chunk_url.get("signedUrl") or signed_chunk_url.get("signed_url")) if isinstance(signed_chunk_url, dict) else None
                
                # Update chunk record with full observability data
                if chunk_id:
                    update_data = {
                        "status": "COMPLETED",
                        "video_url": chunk_video_url or chunk_output_key,
                        "credits_charged": int(chunk_duration),  # Charge for successful chunk
                        "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        # Observability fields
                        "image_url": current_image,
                        "image_index": image_index,
                        "video_chunk_url": chunk_url,
                        "video_chunk_start_time": video_chunk_start_time,
                        "video_chunk_end_time": video_chunk_end_time,
                        "video_chunk_duration": video_chunk_actual_duration,
                        "audio_start_time": audio_start_time,
                        "audio_end_time": audio_start_time + audio_duration,
                        "audio_duration": audio_duration,
                        "sync_offset": sync_offset or 0.0,  # Offset when music starts in video
                        "chunk_duration": chunk_duration,
                        "kling_task_id": task_id,
                        "kling_requested_at": kling_requested_at,
                        "kling_completed_at": kling_completed_at,
                        "kling_video_url": kling_video_url,
                    }
                    supabase.table("video_chunks").update(update_data).eq("id", chunk_id).execute()
                
                final_segments.append(segment_path)
                
                # Update generation progress after chunk completion
                if generation_id:
                    chunk_progress = 10 + int(((i + 1) / num_chunks) * 80)
                    supabase.table("generations").update({
                        "progress_percentage": chunk_progress,
                        "current_stage": "processing_chunks",
                    }).eq("id", generation_id).execute()
                
                print(f"[worker] Chunk {i+1}/{num_chunks} completed successfully")
                
            except Exception as e:
                error_msg = str(e)[:500]
                print(f"[worker] Chunk {i+1}/{num_chunks} failed: {error_msg}")
                if chunk_id:
                    # Try to capture observability data even on failure
                    # (some fields may not be set if error occurred early)
                    try:
                        video_chunk_start_time = i * chunk_duration
                        # Audio timing accounts for sync_offset (when music starts in video)
                        audio_start_time = i * chunk_duration + (sync_offset or 0.0)
                        image_index = i % len(target_images)
                        current_image = target_images[image_index] if target_images else None
                        
                        update_data = {
                            "status": "FAILED",
                            "error_message": error_msg,
                            # Include any observability data we have
                            "video_chunk_start_time": video_chunk_start_time,
                            "audio_start_time": audio_start_time,
                            "sync_offset": sync_offset or 0.0,  # Offset when music starts in video
                            "chunk_duration": chunk_duration,
                            "image_index": image_index,
                            "image_url": current_image,
                        }
                        # Only include fields that were set before the error
                        if 'chunk_url' in locals():
                            update_data["video_chunk_url"] = chunk_url
                        if 'task_id' in locals():
                            update_data["kling_task_id"] = task_id
                        if 'kling_requested_at' in locals():
                            update_data["kling_requested_at"] = kling_requested_at
                        if 'kling_completed_at' in locals():
                            update_data["kling_completed_at"] = kling_completed_at
                        if 'kling_video_url' in locals():
                            update_data["kling_video_url"] = kling_video_url
                            
                        supabase.table("video_chunks").update(update_data).eq("id", chunk_id).execute()
                    except Exception as update_error:
                        # Fallback: just update status and error
                        print(f"[worker] Failed to update observability data for failed chunk: {update_error}")
                        supabase.table("video_chunks").update({
                            "status": "FAILED",
                            "error_message": error_msg,
                        }).eq("id", chunk_id).execute()
                # Continue processing other chunks
                continue
        
        # Stitch all successful chunks
        if len(final_segments) == 0:
            raise Exception("No chunks completed successfully")
        
        # Calculate total credits charged (only for successful chunks)
        # Query completed chunks from database
        try:
            chunks_query = supabase.table("video_chunks").select("credits_charged, status").eq("job_id", job_id).execute()
            chunks_data = chunks_query.data if chunks_query.data else []
            total_credits_charged = sum(
                chunk.get("credits_charged", 0) 
                for chunk in chunks_data
                if chunk.get("status") == "COMPLETED"
            )
        except Exception as calc_error:
            # Fallback: calculate from chunk_duration * number of successful chunks
            print(f"[worker] Error calculating credits from database: {calc_error}. Using fallback calculation.")
            total_credits_charged = len(final_segments) * int(chunk_duration) if chunk_duration else 0
        
        # Update generation with actual credits charged
        if generation_id:
            supabase.table("generations").update({
                "cost_credits": total_credits_charged,
            }).eq("id", generation_id).execute()
        
        # Update generation: stitching stage
        if generation_id:
            supabase.table("generations").update({
                "progress_percentage": 90,
                "current_stage": "stitching",
            }).eq("id", generation_id).execute()
        
        if len(final_segments) > 1:
            concat_file = work_path / "concat_list.txt"
            with open(concat_file, "w") as f:
                for seg in final_segments:
                    f.write(f"file '{seg.absolute()}'\n")
            
            final_path = work_path / "final.mp4"
            subprocess.run(
                ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file),
                 "-c", "copy", str(final_path)],
                check=True, capture_output=True
            )
        else:
            final_path = final_segments[0]
        
        # Update generation: finalizing stage
        if generation_id:
            supabase.table("generations").update({
                "progress_percentage": 95,
                "current_stage": "finalizing",
            }).eq("id", generation_id).execute()
        
        return final_path
