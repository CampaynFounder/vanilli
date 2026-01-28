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


def get_fal_api_key() -> str:
    """Get fal.ai API key."""
    def _k(v): return (v or "").strip() or None
    
    # Support both FAL_API_KEY and KLING_API_KEY for backward compatibility
    fal_api_key = _k(os.environ.get("FAL_API_KEY")) or _k(os.environ.get("KLING_API_KEY"))
    
    if fal_api_key:
        return fal_api_key
    else:
        raise Exception("fal.ai API key not configured. Set FAL_API_KEY (or KLING_API_KEY for backward compatibility)")


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
    user_bpm = job.get("user_bpm")  # User-provided BPM (if available)
    bpm = job.get("bpm")  # Calculated BPM from analyzer
    
    print(f"[worker] Processing job {job_id} (tier: {user_tier}, generation: {generation_id}, analysis: {analysis_status})")
    if user_bpm:
        print(f"[worker] User-provided BPM: {user_bpm:.2f}")
    if bpm:
        print(f"[worker] Calculated BPM: {bpm:.2f}")
    print(f"[worker] Chunk duration: {chunk_duration:.3f}s (calculated from {'user' if user_bpm else 'detected'} BPM)")
    
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
        # Initialize fal.ai Kling client
        fal_api_key = get_fal_api_key()
        kling_client = KlingClient(fal_api_key)
        
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
                sync_offset, chunk_duration, user_tier, kling_client, supabase_url
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
        
        # Verify final video exists before trying to upload
        if not final_video_path.exists():
            raise Exception(f"Final video file does not exist: {final_video_path}")
        if final_video_path.stat().st_size == 0:
            raise Exception(f"Final video file is empty: {final_video_path}")
        
        print(f"[worker] Final video file exists: {final_video_path}, size: {final_video_path.stat().st_size / 1024 / 1024:.2f} MB")
        
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
            
            # Safely get project_id - generation might not exist
            try:
                gen_data = supabase.table("generations").select("project_id").eq("id", generation_id).maybe_single().execute()
                if gen_data.data and gen_data.data.get("project_id"):
                    supabase.table("projects").update({"status": "failed"}).eq("id", gen_data.data["project_id"]).execute()
            except Exception as e:
                print(f"[worker] Could not update project status (generation may not exist): {e}")


def process_job_with_chunks(
    orchestrator, supabase, job_id, generation_id,
    user_video_url, master_audio_url, target_images, prompt,
    sync_offset, chunk_duration, user_tier, kling_client, supabase_url
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
        
        # Convert audio to WAV if needed (MP3, MP4, or other formats)
        audio_ext = master_audio_url.lower().split('.')[-1] if '.' in master_audio_url.lower() else ''
        if audio_ext not in ('wav', 'wave'):
            # Convert to WAV format for processing
            print(f"[worker] Converting audio from {audio_ext.upper()} to WAV format...")
            audio_wav_path = work_path / "audio_extracted.wav"
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(master_audio_raw_path), "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(audio_wav_path)],
                check=True, capture_output=True
            )
            master_audio_raw_path = audio_wav_path
            print(f"[worker] Audio converted to WAV successfully")
        
        # Smart Video Trim: Apply trim logic based on sync_offset polarity
        # This ensures the final output starts exactly on the downbeat
        # Positive offset (> 0): Dead space in video → Trim VIDEO
        # Negative offset (< 0): Video starts mid-song → Trim AUDIO
        # Zero offset: No trimming needed
        print(f"[worker] Sync offset: {sync_offset:.3f}s")
        
        # Get original durations before trimming
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(user_video_raw_path)],
            capture_output=True, text=True, check=True
        )
        video_duration_raw = float(result.stdout.strip())
        
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(master_audio_raw_path)],
            capture_output=True, text=True, check=True
        )
        audio_duration_raw = float(result.stdout.strip())
        
        if abs(sync_offset) < 0.01:
            print(f"[worker] Offset is near zero, no trimming needed")
            user_video_path = user_video_raw_path
            master_audio_path = master_audio_raw_path
            video_duration = video_duration_raw
            audio_duration = audio_duration_raw
        elif sync_offset > 0:
            print(f"[worker] Positive offset: Trimming VIDEO by {sync_offset:.3f}s (removing dead space)")
            # Trim video: apply -ss to video input, re-encode for frame-accurate cut
            video_trimmed_path = work_path / "video_trimmed.mp4"
            trim_result = subprocess.run(
                ["ffmpeg", "-y", "-ss", str(sync_offset), "-i", str(user_video_raw_path),
                 "-c:v", "libx264", "-preset", "fast", "-crf", "23",  # Re-encode for frame-accurate trim
                 "-pix_fmt", "yuv420p",  # Ensure compatibility
                 "-avoid_negative_ts", "make_zero",  # Ensure timestamps start at 0
                 "-movflags", "+faststart",  # Web optimization
                 str(video_trimmed_path)],
                check=True, capture_output=True, text=True
            )
            # Verify trimmed video was created and has video stream
            if not video_trimmed_path.exists() or video_trimmed_path.stat().st_size == 0:
                raise Exception(f"Video trimming failed - file missing or empty")
            # Verify video has video stream
            probe_result = subprocess.run(
                ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_type",
                 "-of", "default=noprint_wrappers=1:nokey=1", str(video_trimmed_path)],
                capture_output=True, text=True
            )
            if probe_result.returncode != 0 or "video" not in probe_result.stdout.lower():
                raise Exception(f"Trimmed video has no video stream - trimming may have failed")
            print(f"[worker] Video trimmed successfully: {video_trimmed_path.stat().st_size / 1024 / 1024:.2f} MB")
            user_video_path = video_trimmed_path
            master_audio_path = master_audio_raw_path
            # Video duration is reduced by sync_offset
            video_duration = max(0, video_duration_raw - sync_offset)
            audio_duration = audio_duration_raw
        else:
            # Negative offset: Trim audio
            trim_val = abs(sync_offset)
            print(f"[worker] Negative offset: Trimming AUDIO by {trim_val:.3f}s (matching mid-song)")
            audio_trimmed_path = work_path / "audio_trimmed.wav"
            subprocess.run(
                ["ffmpeg", "-y", "-ss", str(trim_val), "-i", str(master_audio_raw_path),
                 "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le",
                 str(audio_trimmed_path)],
                check=True, capture_output=True, text=True
            )
            user_video_path = user_video_raw_path
            master_audio_path = audio_trimmed_path
            # Audio duration is reduced by trim_val
            video_duration = video_duration_raw
            audio_duration = max(0, audio_duration_raw - trim_val)
        
        # Use video_duration from Smart Video Trim (already calculated above)
        duration = video_duration
        
        # Calculate number of chunks
        # Skip last chunk if it would be less than 3 seconds
        MIN_CHUNK_DURATION = 3.0
        num_chunks_raw = ceil(duration / chunk_duration)
        last_chunk_start = (num_chunks_raw - 1) * chunk_duration
        last_chunk_duration = duration - last_chunk_start
        
        if last_chunk_duration < MIN_CHUNK_DURATION and num_chunks_raw > 1:
            # Skip the last chunk if it's too short
            num_chunks = int(num_chunks_raw - 1)
            print(f"[worker] Video duration: {duration:.2f}s, chunk duration: {chunk_duration:.2f}s")
            print(f"[worker] Last chunk would be {last_chunk_duration:.2f}s (< {MIN_CHUNK_DURATION}s), skipping it")
            print(f"[worker] Processing {num_chunks} chunks (instead of {int(num_chunks_raw)})")
        else:
            num_chunks = int(num_chunks_raw)
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
                # After Smart Video Trim, chunk 0 starts at 0, subsequent chunks continue sequentially
                # IMPORTANT: Re-encode (not copy) to preserve quality and fix timestamps
                start_time = i * chunk_duration
                chunk_path = chunks_dir / f"chunk_{i:03d}.mp4"
                print(f"[worker] Extracting chunk {i+1} video: start={start_time:.3f}s, duration={chunk_duration:.3f}s (re-encoding for quality)")
                subprocess.run(
                    ["ffmpeg", "-y", "-i", str(user_video_path), "-ss", str(start_time), "-t", str(chunk_duration),
                     "-c:v", "libx264", "-preset", "fast", "-crf", "23",  # Re-encode for quality
                     "-pix_fmt", "yuv420p",  # Ensure compatibility
                     "-avoid_negative_ts", "make_zero",  # Fix timestamps
                     "-movflags", "+faststart",  # Web optimization
                     str(chunk_path)],
                    check=True, capture_output=True, text=True
                )
                # Verify chunk was created and has video stream
                if not chunk_path.exists() or chunk_path.stat().st_size == 0:
                    raise Exception(f"Video chunk {i+1} extraction failed - file missing or empty")
                probe_result = subprocess.run(
                    ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_type",
                     "-of", "default=noprint_wrappers=1:nokey=1", str(chunk_path)],
                    capture_output=True, text=True
                )
                if probe_result.returncode != 0 or "video" not in probe_result.stdout.lower():
                    raise Exception(f"Video chunk {i+1} has no video stream - extraction may have failed")
                print(f"[worker] Video chunk {i+1} extracted: {chunk_path.stat().st_size / 1024:.2f} KB")
                
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
                
                # Audio timing: After Smart Video Trim, chunk 0 audio starts at 0
                # Subsequent chunks continue sequentially
                if i == 0:
                    # Chunk 0: After Smart Video Trim, audio starts at 0 (video or audio was trimmed)
                    audio_start_time = 0
                else:
                    # Chunk 1+: Continue sequentially from where previous chunk ended
                    # If chunk 0 is chunk_duration long, chunk 1 starts at chunk_duration
                    audio_start_time = i * chunk_duration
                
                audio_duration = video_chunk_actual_duration
                
                image_index = i % len(target_images)
                current_image = target_images[image_index]
                
                # Log chunk details before calling Kling
                kling_requested_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                print(f"[worker] Chunk {i+1}/{num_chunks} observability:")
                print(f"  - Video chunk: {video_chunk_start_time:.3f}s to {video_chunk_end_time:.3f}s (duration: {video_chunk_actual_duration:.3f}s)")
                print(f"  - Audio chunk: {audio_start_time:.3f}s to {audio_start_time + audio_duration:.3f}s (duration: {audio_duration:.3f}s) in master audio")
                if i == 0:
                    print(f"  - Chunk 0: After Smart Video Trim, video and audio both start at 0s")
                else:
                    print(f"  - Chunk {i}: Audio continues sequentially from chunk {i-1} (starts at {audio_start_time:.3f}s)")
                print(f"  - Image index: {image_index}/{len(target_images)-1}, URL: {current_image}")
                print(f"  - Video chunk URL: {chunk_url[:80]}...")
                
                # Call Kling with webhook support
                # Construct webhook URL for fal.ai callbacks
                webhook_url = f"{supabase_url}/functions/v1/fal-webhook"
                print(f"[worker] Submitting chunk {i+1} to fal.ai with webhook: {webhook_url[:60]}...")
                task_id = kling_client.generate(chunk_url, current_image, prompt, webhook_url=webhook_url)
                kling_completed_at = None
                
                # Log the request_id we received from fal.ai
                print(f"[worker] Received request_id from fal.ai: {task_id} for chunk {i+1}")
                
                # Store fal_request_id IMMEDIATELY so webhook can find the chunk
                # This must be done before polling starts, as webhook might arrive first
                # Note: We store the request_id from the initial POST response
                # The webhook may send request_id or gateway_request_id, but request_id should match
                if chunk_id:
                    try:
                        update_result = supabase.table("video_chunks").update({
                            "fal_request_id": task_id,  # fal.ai request_id
                            "kling_requested_at": kling_requested_at,
                        }).eq("id", chunk_id).execute()
                        if update_result.data:
                            print(f"[worker] ✓ Stored fal_request_id '{task_id}' for chunk {i+1} (chunk_id: {chunk_id})")
                            print(f"[worker]   Webhook should be able to find this chunk using request_id: {task_id}")
                        else:
                            print(f"[worker] WARNING: Failed to store fal_request_id for chunk {i+1} - update returned no data")
                            print(f"[worker]   chunk_id: {chunk_id}, task_id: {task_id}")
                    except Exception as store_error:
                        print(f"[worker] ERROR: Failed to store fal_request_id for chunk {i+1}: {store_error}")
                        print(f"[worker]   chunk_id: {chunk_id}, task_id: {task_id}")
                        # Continue anyway - polling will still work
                else:
                    print(f"[worker] WARNING: chunk_id is None for chunk {i+1}, cannot store fal_request_id")
                    print(f"[worker]   This means the chunk record doesn't exist - webhook will not be able to find it!")
                
                # Poll for status (webhook will also update database, but we poll for immediate results)
                # With webhooks, if polling fails, the webhook will still update the chunk
                print(f"[worker] Polling fal.ai for chunk {i+1} (request_id: {task_id})...")
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
                
                # DO NOT trim chunk 0 video - keep dead space
                # We'll delay chunk 0 audio by sync_offset when muxing instead
                
                # Extract audio slice (audio_start_time and audio_duration already calculated above)
                audio_slice_path = chunks_dir / f"audio_chunk_{i:03d}.wav"
                print(f"[worker] Extracting audio slice {i+1}: start={audio_start_time:.3f}s, duration={audio_duration:.3f}s from master audio")
                subprocess.run(
                    ["ffmpeg", "-y", "-i", str(master_audio_path), "-ss", str(audio_start_time), "-t", str(audio_duration),
                     "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(audio_slice_path)],
                    check=True, capture_output=True
                )
                # Verify audio slice was created
                if not audio_slice_path.exists() or audio_slice_path.stat().st_size == 0:
                    raise Exception(f"Audio slice {i+1} extraction failed - file missing or empty")
                print(f"[worker] Audio slice {i+1} extracted: {audio_slice_path.stat().st_size / 1024:.2f} KB")
                
                # Mux video + audio
                # After Smart Video Trim, chunk 0 video/audio both start at 0
                # Subsequent chunks continue sequentially, no delay needed
                segment_path = chunks_dir / f"segment_{i:03d}.mp4"
                print(f"[worker] Muxing chunk {i+1}: Kling video + audio slice")
                # Simple muxing - both video and audio are already aligned after Smart Video Trim
                result = subprocess.run(
                    ["ffmpeg", "-y",
                     "-i", str(kling_output_path),  # Video from Kling
                     "-i", str(audio_slice_path),   # Audio slice (aligned after Smart Video Trim)
                     "-map", "0:v:0", "-map", "1:a:0",
                     "-c:v", "libx264", "-preset", "veryfast",
                     "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
                     "-movflags", "+faststart",
                     "-shortest", str(segment_path)],
                    check=True, capture_output=True, text=True
                )
                # Log FFmpeg output for debugging
                if result.stdout:
                    print(f"[worker] FFmpeg output: {result.stdout[:500]}")
                if result.stderr:
                    print(f"[worker] FFmpeg stderr: {result.stderr[:500]}")
                print(f"[worker] Chunk {i+1} muxing completed (video and audio aligned after Smart Video Trim)")
                
                # Verify muxed segment exists and has content
                if not segment_path.exists() or segment_path.stat().st_size == 0:
                    raise Exception(f"Muxed segment {i+1} is missing or empty")
                print(f"[worker] Muxed segment {i+1} size: {segment_path.stat().st_size / 1024 / 1024:.2f} MB")
                
                # Upload muxed chunk to Supabase (this is the final processed video with audio aligned)
                # IMPORTANT: This is the VANNILLI-processed video, NOT the raw Kling output
                chunk_output_key = f"{OUTPUTS_PREFIX}/{generation_id or job_id}/chunk_{i:03d}.mp4"
                print(f"[worker] Uploading muxed chunk {i+1} to Supabase: {chunk_output_key}")
                with open(segment_path, "rb") as f:
                    supabase.storage.from_(BUCKET).upload(chunk_output_key, f.read(), file_options={"content-type": "video/mp4"})
                print(f"[worker] Chunk {i+1} uploaded successfully to Supabase Storage")
                
                # Create signed URL for the muxed video (NOT the Kling URL)
                # This is the final processed video with audio aligned by VANNILLI's engine
                signed_chunk_url = supabase.storage.from_(BUCKET).create_signed_url(chunk_output_key, 3600)
                if isinstance(signed_chunk_url, tuple):
                    signed_chunk_url = signed_chunk_url[0] if signed_chunk_url else {}
                chunk_video_url = (signed_chunk_url.get("signedUrl") or signed_chunk_url.get("signed_url")) if isinstance(signed_chunk_url, dict) else None
                
                if not chunk_video_url:
                    # Fallback: construct public URL if signed URL creation fails
                    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
                    chunk_video_url = f"{supabase_url}/storage/v1/object/public/{BUCKET}/{chunk_output_key}"
                
                print(f"[worker] Chunk {i+1} final video URL (muxed with audio): {chunk_video_url[:80]}...")
                
                # Update chunk record with full observability data
                # Note: Muxing has completed successfully at this point
                if chunk_id:
                    update_data = {
                        "status": "COMPLETED",
                        # video_url must be the muxed Supabase URL, NOT the Kling URL
                        # This is the final processed video with audio aligned by VANNILLI's engine
                        "video_url": chunk_video_url or chunk_output_key,
                        "credits_charged": int(chunk_duration),  # Charge for successful chunk
                        "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        # Observability fields
                        "image_url": current_image,
                        "image_index": image_index,
                        "video_chunk_url": chunk_url,
                        "video_chunk_start_time": video_chunk_start_time,
                        "audio_start_time": audio_start_time,
                        "sync_offset": sync_offset or 0.0,  # Offset when music starts in video
                        "chunk_duration": chunk_duration,  # Duration of this chunk (used to calculate end times in views)
                        "fal_request_id": task_id,  # fal.ai request_id
                        "kling_requested_at": kling_requested_at,
                        "kling_completed_at": kling_completed_at,
                        "kling_video_url": kling_video_url,
                    }
                    try:
                        supabase.table("video_chunks").update(update_data).eq("id", chunk_id).execute()
                        print(f"[worker] Chunk {i+1} database update successful")
                    except Exception as db_error:
                        # Log database error but don't fail the chunk - muxing succeeded
                        error_str = str(db_error)
                        print(f"[worker] WARNING: Database update failed for chunk {i+1}: {error_str}")
                        print(f"[worker] Chunk {i+1} muxing completed successfully, but database update failed")
                        # Try to update with minimal fields
                        try:
                            minimal_update = {
                                "status": "COMPLETED",
                                "video_url": chunk_video_url or chunk_output_key,
                                "error_message": f"Database update error: {error_str[:200]}",
                            }
                            supabase.table("video_chunks").update(minimal_update).eq("id", chunk_id).execute()
                        except Exception:
                            # If even minimal update fails, log but continue
                            print(f"[worker] ERROR: Could not update chunk {i+1} status in database")
                
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
                        # Audio timing: use same logic as successful path
                        if sync_offset and sync_offset > 0:
                            if i == 0:
                                audio_start_time = 0
                            elif i == 1:
                                audio_start_time = chunk_duration - sync_offset
                            else:
                                if i == 2:
                                    prev_audio_start = chunk_duration - sync_offset
                                    prev_audio_end = prev_audio_start + chunk_duration
                                    audio_start_time = prev_audio_end
                                else:
                                    audio_start_time = (i * chunk_duration) - sync_offset
                        else:
                            audio_start_time = i * chunk_duration
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
        
        # Verify final video exists and has content
        if not final_path.exists():
            raise Exception(f"Final video file does not exist: {final_path}")
        if final_path.stat().st_size == 0:
            raise Exception(f"Final video file is empty: {final_path}")
        
        print(f"[worker] Final video created: {final_path}, size: {final_path.stat().st_size / 1024 / 1024:.2f} MB")
        
        # IMPORTANT: Read file contents into memory before temp directory is deleted
        # The temp directory will be cleaned up when this function returns
        final_video_bytes = final_path.read_bytes()
        print(f"[worker] Final video loaded into memory: {len(final_video_bytes) / 1024 / 1024:.2f} MB")
        
        # Create a temporary file in a persistent location (outside temp directory)
        import tempfile as tf
        persistent_temp = tf.NamedTemporaryFile(delete=False, suffix='.mp4')
        persistent_temp.write(final_video_bytes)
        persistent_temp.close()
        persistent_final_path = Path(persistent_temp.name)
        
        print(f"[worker] Final video saved to persistent location: {persistent_final_path}")
        
        return persistent_final_path
