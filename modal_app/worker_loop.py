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
img = modal.Image.debian_slim().apt_install(
    "ffmpeg"
).pip_install(
    "requests", "supabase", "audalign", "pyjwt", "librosa", "numpy"
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
    # These modules will be available in the Modal container
    import sys
    from pathlib import Path
    
    # Add modal_app directory to path for imports
    modal_app_dir = Path(__file__).parent
    if str(modal_app_dir) not in sys.path:
        sys.path.insert(0, str(modal_app_dir))
    
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
        user_video_path = work_path / "user_video.mp4"
        master_audio_path = work_path / "master_audio.wav"
        
        # Download files
        print(f"[worker] Downloading video from {user_video_url}")
        r = requests.get(user_video_url, timeout=120)
        r.raise_for_status()
        user_video_path.write_bytes(r.content)
        
        print(f"[worker] Downloading audio from {master_audio_url}")
        r = requests.get(master_audio_url, timeout=120)
        r.raise_for_status()
        audio_content = r.content
        master_audio_path.write_bytes(audio_content)
        
        # Extract audio from MP4 if needed
        if master_audio_url.lower().endswith('.mp4'):
            import subprocess
            audio_wav_path = work_path / "audio_extracted.wav"
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(master_audio_path), "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(audio_wav_path)],
                check=True, capture_output=True
            )
            master_audio_path = audio_wav_path
        
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
                
                # Call Kling
                current_image = target_images[i % len(target_images)]
                task_id = kling_client.generate(chunk_url, current_image, prompt)
                status, kling_video_url = kling_client.poll_status(task_id)
                
                if status != "succeed" or not kling_video_url:
                    raise Exception(f"Kling generation failed for chunk {i+1}")
                
                # Download Kling output
                kling_output_path = chunks_dir / f"kling_chunk_{i:03d}.mp4"
                r = requests.get(kling_video_url, timeout=120)
                r.raise_for_status()
                kling_output_path.write_bytes(r.content)
                
                # Extract audio slice
                audio_start = (i * chunk_duration) + (sync_offset or 0.0)
                audio_slice_path = chunks_dir / f"audio_chunk_{i:03d}.wav"
                subprocess.run(
                    ["ffmpeg", "-y", "-i", str(master_audio_path), "-ss", str(audio_start), "-t", str(chunk_duration),
                     "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(audio_slice_path)],
                    check=True, capture_output=True
                )
                
                # Mux video + audio
                segment_path = chunks_dir / f"segment_{i:03d}.mp4"
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
                
                # Update chunk record
                if chunk_id:
                    supabase.table("video_chunks").update({
                        "status": "COMPLETED",
                        "video_url": chunk_video_url or chunk_output_key,
                        "credits_charged": int(chunk_duration),  # Charge for successful chunk
                        "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    }).eq("id", chunk_id).execute()
                
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
        total_credits_charged = sum(
            chunk.get("credits_charged", 0) 
            for chunk in (chunks or []) 
            if chunk.get("status") == "COMPLETED"
        )
        
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
