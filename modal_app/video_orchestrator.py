"""VideoProductionOrchestrator: Tier-based video processing with global audio alignment."""
import json
import os
import subprocess
import tempfile
import time
from enum import Enum
from math import ceil
from pathlib import Path
from typing import List, Optional, Tuple

import requests
# Supabase import will be available at runtime in Modal container


class Tier(Enum):
    """User tier enumeration."""
    OPEN_MIC = "open_mic"
    ARTIST = "artist"
    LABEL = "label"
    INDUSTRY = "industry"
    DEMO = "demo"


class TierRestrictionError(Exception):
    """Raised when tier restrictions are violated."""
    pass


class ValidationError(Exception):
    """Raised when validation fails."""
    pass


class KlingClient:
    """Simplified fal.ai Kling video API client wrapper."""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://queue.fal.run"
        self.endpoint = "fal-ai/kling-video/v2.6/standard/motion-control"  # Full endpoint for submission
        self.model_id = "kling-video/v2.6"  # Model ID for status/result endpoints (no namespace, no subpath)
    
    def generate(self, driver_video_url: str, target_image_url: str, prompt: Optional[str] = None, webhook_url: Optional[str] = None) -> str:
        """Generate video via fal.ai Kling API. Returns request_id for polling.
        
        Args:
            driver_video_url: URL of the driver video
            target_image_url: URL of the target image
            prompt: Optional prompt text
            webhook_url: Optional webhook URL for async callbacks (passed as query parameter)
        """
        # Direct POST format (not client library format)
        # Payload is sent directly, not wrapped in "input"
        payload = {
            "image_url": target_image_url,
            "video_url": driver_video_url,
            "character_orientation": "image",  # "image" for portrait (max 10s) or "video" for full-body (max 30s)
        }
        if prompt:
            payload["prompt"] = prompt[:100]
        
        # Build URL with webhook as query parameter (not in JSON body)
        url = f"{self.base_url}/{self.endpoint}"
        if webhook_url:
            from urllib.parse import urlencode
            url += f"?{urlencode({'fal_webhook': webhook_url})}"
        
        r = requests.post(
            url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Key {self.api_key}",
            },
            json=payload,
            timeout=60,
        )
        r.raise_for_status()
        j = r.json()
        
        # fal.ai returns request_id for queue-based endpoints
        request_id = j.get("request_id")
        if not request_id:
            error_msg = j.get("detail", {}).get("message") if isinstance(j.get("detail"), dict) else j.get("detail", "Unknown error")
            raise Exception(f"fal.ai API error: {error_msg}")
        return request_id
    
    def poll_status(self, request_id: str, max_attempts: int = 60) -> Tuple[str, Optional[str]]:
        """Poll fal.ai task status. Returns (status, video_url). Status: 'succeed', 'failed', 'processing'."""
        status_poll_failures = 0
        max_status_failures = 10  # After 10 status poll failures, try direct result fetch
        
        for attempt in range(max_attempts):
            time.sleep(5)
            try:
                # fal.ai queue API: get status (use base model_id, exclude subpath)
                r = requests.get(
                    f"{self.base_url}/{self.model_id}/requests/{request_id}/status",
                    headers={"Authorization": f"Key {self.api_key}"},
                    timeout=30,
                )
                r.raise_for_status()
                j = r.json()
                status_poll_failures = 0  # Reset on success
                
                # fal.ai status format: "IN_QUEUE", "IN_PROGRESS", "COMPLETED", "FAILED"
                status = j.get("status")
                print(f"[fal.ai] Poll attempt {attempt + 1}/{max_attempts}: status = {status}")
                
                if status == "COMPLETED":
                    print(f"[fal.ai] Status is COMPLETED, fetching result for request_id: {request_id}")
                    # Get the result (use base model_id, exclude subpath)
                    result_r = requests.get(
                        f"{self.base_url}/{self.model_id}/requests/{request_id}",
                        headers={"Authorization": f"Key {self.api_key}"},
                        timeout=30,
                    )
                    result_r.raise_for_status()
                    result_j = result_r.json()
                    
                    print(f"[fal.ai] ===== FULL RESULT PAYLOAD ===== ")
                    print(f"[fal.ai] {json.dumps(result_j, indent=2)}")
                    print(f"[fal.ai] ===== END RESULT PAYLOAD ===== ")
                    
                    # Extract video URL from fal.ai response
                    # fal.ai returns: {"response": {"video": {"url": "...", "file_name": "...", ...}}}
                    # Or directly: {"video": {"url": "..."}}
                    response_data = result_j.get("response", {})
                    video_data = response_data.get("video") if response_data else result_j.get("video")
                    
                    print(f"[fal.ai] Extracted video_data: {video_data}")
                    
                    if video_data:
                        if isinstance(video_data, dict):
                            video_url = video_data.get("url")
                            print(f"[fal.ai] Video URL (from dict.url): {video_url}")
                        elif isinstance(video_data, str):
                            video_url = video_data
                            print(f"[fal.ai] Video URL (direct string): {video_url}")
                        else:
                            video_url = None
                            print(f"[fal.ai] Video data is neither dict nor string: {type(video_data)}")
                        
                        if video_url:
                            print(f"[fal.ai] ✓ Successfully extracted video URL: {video_url}")
                            return ("succeed", video_url)
                    
                    print(f"[fal.ai] ERROR: No video URL found in result payload")
                    raise Exception(f"fal.ai task completed but no video URL found: {result_j}")
                elif status == "FAILED":
                    error_data = j.get("error", {})
                    if isinstance(error_data, dict):
                        error_msg = error_data.get("message", str(error_data))
                    else:
                        error_msg = str(error_data) if error_data else "Unknown error"
                    raise Exception(f"fal.ai task failed: {error_msg}")
                elif status in ("IN_PROGRESS", "IN_QUEUE"):
                    # Continue polling
                    continue
                elif status in ("COMPLETED", "FAILED"):
                    break
            except requests.exceptions.RequestException as e:
                status_poll_failures += 1
                print(f"[fal.ai] Poll error: {e}, continuing...")
                
                # If status polling keeps failing, try fetching result directly as fallback
                # (useful if status endpoint has issues but result endpoint works)
                if status_poll_failures >= max_status_failures and attempt >= 5:  # Wait at least 5 attempts before trying fallback
                    print(f"[fal.ai] Status polling failed {status_poll_failures} times, trying direct result fetch as fallback...")
                    try:
                        result_r = requests.get(
                            f"{self.base_url}/{self.model_id}/requests/{request_id}",
                            headers={"Authorization": f"Key {self.api_key}"},
                            timeout=30,
                        )
                        if result_r.status_code == 200:
                            result_j = result_r.json()
                            # Check if it's completed
                            if result_j.get("status") == "COMPLETED":
                                response_data = result_j.get("response", {})
                                video_data = response_data.get("video") if response_data else result_j.get("video")
                                if video_data:
                                    if isinstance(video_data, dict):
                                        video_url = video_data.get("url")
                                    elif isinstance(video_data, str):
                                        video_url = video_data
                                    else:
                                        video_url = None
                                    
                                    if video_url:
                                        print(f"[fal.ai] Successfully fetched result via fallback method")
                                        return ("succeed", video_url)
                        elif result_r.status_code == 400:
                            # Not ready yet, continue polling
                            print(f"[fal.ai] Result not ready yet (400), continuing to poll...")
                            continue
                    except Exception as fallback_e:
                        print(f"[fal.ai] Fallback result fetch also failed: {fallback_e}, continuing...")
                
                continue
        raise Exception("fal.ai task timed out")


class VideoProductionOrchestrator:
    """Orchestrates tier-based video production with global audio alignment."""
    
    CHUNK_LIMIT = 9.0  # seconds
    INDUSTRY_MAX_DURATION = 90.0  # seconds
    
    def __init__(self, kling_client: KlingClient, user_tier: str, supabase_client):
        """Initialize orchestrator.
        
        Args:
            kling_client: Kling API client
            user_tier: User tier ('open_mic', 'artist', 'label', 'industry')
            supabase_client: Supabase client for database operations
        """
        self.kling_client = kling_client
        try:
            self.tier = Tier(user_tier)
        except ValueError:
            raise ValidationError(f"Invalid tier: {user_tier}")
        self.supabase = supabase_client
    
    def validate_submission(self, video_duration: float):
        """Validate video duration against tier restrictions.
        
        Raises:
            TierRestrictionError: If lower tier submits > 9s video
            ValidationError: If industry/demo tier exceeds max duration
        """
        if self.tier == Tier.DEMO:
            if video_duration > 20.0:
                raise ValidationError(f"DEMO tier limited to 20s.")
        elif self.tier == Tier.INDUSTRY:
            if video_duration > self.INDUSTRY_MAX_DURATION:
                raise ValidationError(f"Industry tier limited to {self.INDUSTRY_MAX_DURATION}s.")
        elif video_duration > self.CHUNK_LIMIT:
            raise TierRestrictionError(
                f"Manual clipping required for {self.tier.value} tier. Max {self.CHUNK_LIMIT}s."
            )
    
    def get_video_duration(self, video_path: Path) -> float:
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
    
    def find_global_offset(self, user_video_path: Path, master_audio_path: Path) -> float:
        """Find global sync offset between video and master audio using audalign.
        
        Returns:
            Offset in seconds. Positive means master audio is ahead of video.
        """
        try:
            import audalign
        except ImportError:
            raise Exception("audalign not installed. Install with: pip install audalign")
        
        # Extract audio from video for alignment
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_video_audio:
            tmp_video_audio_path = Path(tmp_video_audio.name)
        
        try:
            subprocess.run(
                [
                    "ffmpeg", "-y", "-i", str(user_video_path),
                    "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
                    str(tmp_video_audio_path)
                ],
                check=True,
                capture_output=True,
            )
            
            # Use audalign to find sync offset
            alignment = audalign.target_align(
                str(master_audio_path),
                str(tmp_video_audio_path),
            )
            
            # audalign returns offset in seconds
            # Positive offset means master is ahead of video
            offset = alignment.get("offset", 0.0)
            if not isinstance(offset, (int, float)):
                offset = float(offset)
            return offset
        finally:
            if tmp_video_audio_path.exists():
                tmp_video_audio_path.unlink()
    
    def split_video_file(self, video_path: Path, chunk_duration: float, output_dir: Path) -> List[Path]:
        """Split video into chunks of specified duration.
        
        Returns:
            List of chunk file paths
        """
        chunks = []
        video_duration = self.get_video_duration(video_path)
        num_chunks = int(ceil(video_duration / chunk_duration))
        
        for i in range(num_chunks):
            start_time = i * chunk_duration
            chunk_path = output_dir / f"chunk_{i:03d}.mp4"
            
            # Extract chunk: -ss start, -t duration, -c copy for speed
            subprocess.run(
                [
                    "ffmpeg", "-y", "-i", str(video_path),
                    "-ss", str(start_time),
                    "-t", str(chunk_duration),
                    "-c", "copy",  # Fast copy, no re-encode
                    str(chunk_path)
                ],
                check=True,
                capture_output=True,
            )
            chunks.append(chunk_path)
        
        return chunks
    
    def extract_audio_slice(
        self, master_audio_path: Path, start_time: float, duration: float, output_path: Path
    ):
        """Extract audio slice from master track using global offset.
        
        Args:
            master_audio_path: Path to master audio file
            start_time: Start time in master audio (already includes global offset)
            duration: Duration to extract
            output_path: Output WAV file path
        """
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(master_audio_path),
                "-ss", str(start_time),
                "-t", str(duration),
                "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le",
                str(output_path)
            ],
            check=True,
            capture_output=True,
        )
    
    def mux_video_audio(self, video_path: Path, audio_path: Path, output_path: Path):
        """Mux AI-generated video with clean audio slice."""
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(video_path),
                "-i", str(audio_path),
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "192k",
                "-movflags", "+faststart",
                "-shortest",
                str(output_path)
            ],
            check=True,
            capture_output=True,
        )
    
    def stitch_segments(self, segment_paths: List[Path], output_path: Path):
        """Stitch multiple video segments into one final video."""
        if len(segment_paths) == 1:
            # Just copy the single segment
            subprocess.run(["cp", str(segment_paths[0]), str(output_path)], check=True)
            return
        
        # Create concat file for ffmpeg
        concat_file = output_path.parent / "concat_list.txt"
        with open(concat_file, "w") as f:
            for seg in segment_paths:
                f.write(f"file '{seg.absolute()}'\n")
        
        try:
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-f", "concat", "-safe", "0",
                    "-i", str(concat_file),
                    "-c", "copy",  # Fast copy, no re-encode
                    str(output_path)
                ],
                check=True,
                capture_output=True,
            )
        finally:
            if concat_file.exists():
                concat_file.unlink()
    
    def process_job(
        self,
        user_video_url: str,
        master_audio_url: str,
        images: List[str],
        prompt: Optional[str] = None,
        generation_id: Optional[str] = None,
        job_id: Optional[str] = None,
        sync_offset: Optional[float] = None,
        chunk_duration: Optional[float] = None,
    ) -> Path:
        """Process video generation job with tier-based logic.
        
        Args:
            user_video_url: URL to user's tracking video
            master_audio_url: URL to master audio track
            images: List of target image URLs (cycled if multiple chunks)
            prompt: Optional scene prompt
            generation_id: Generation ID for database updates
        
        Returns:
            Path to final output video file
        """
        with tempfile.TemporaryDirectory() as work_dir:
            work_path = Path(work_dir)
            user_video_path = work_path / "user_video.mp4"
            master_audio_path = work_path / "master_audio.wav"
            
            # Download source files
            print(f"[orchestrator] Downloading user video from {user_video_url}")
            r = requests.get(user_video_url, timeout=120)
            r.raise_for_status()
            user_video_path.write_bytes(r.content)
            
            print(f"[orchestrator] Downloading master audio from {master_audio_url}")
            r = requests.get(master_audio_url, timeout=120)
            r.raise_for_status()
            master_audio_path.write_bytes(r.content)
            
            # 1. Get duration & validate tier
            duration = self.get_video_duration(user_video_path)
            print(f"[orchestrator] Video duration: {duration}s, tier: {self.tier.value}")
            self.validate_submission(duration)
            
            # 2. GLOBAL ALIGNMENT (use provided offset if available, otherwise calculate)
            if sync_offset is not None:
                global_offset = sync_offset
                print(f"[orchestrator] Using provided sync offset: {global_offset}s")
            else:
                print("[orchestrator] Performing global audio alignment...")
                global_offset = self.find_global_offset(user_video_path, master_audio_path)
            print(f"[orchestrator] Global offset: {global_offset}s (master is {'ahead' if global_offset > 0 else 'behind'} video)")
            
            # 3. Determine chunk size
            # For DEMO/Industry: use tempo-based chunk_duration if provided
            # For others: use fixed CHUNK_LIMIT (9s)
            use_tempo_chunking = (self.tier == Tier.INDUSTRY or self.tier.value == 'demo') and chunk_duration is not None
            effective_chunk_size = chunk_duration if use_tempo_chunking else self.CHUNK_LIMIT
            
            # 4. Execution pipeline
            final_segments = []
            num_chunks = int(ceil(duration / effective_chunk_size))
            
            print(f"[orchestrator] Using chunk size: {effective_chunk_size:.2f}s, will create {num_chunks} chunks")
            
            # Split video if needed (Industry/DEMO tier with multi-chunk)
            if num_chunks > 1:
                print(f"[orchestrator] Splitting video into {num_chunks} chunks...")
                video_chunks = self.split_video_file(user_video_path, effective_chunk_size, work_path)
            else:
                video_chunks = [user_video_path]
            
            chunks_dir = work_path / "chunks"
            chunks_dir.mkdir(exist_ok=True)
            
            for i, vid_chunk in enumerate(video_chunks):
                print(f"[orchestrator] Processing chunk {i+1}/{len(video_chunks)}...")
                
                # A. Process visuals (Kling API)
                current_image = images[i % len(images)]
                
                # Upload chunk to temporary storage for Kling
                # In production, upload to Supabase Storage and get signed URL
                chunk_storage_path = f"temp_chunks/{generation_id or 'temp'}/chunk_{i:03d}.mp4"
                with open(vid_chunk, "rb") as f:
                    self.supabase.storage.from_("vannilli").upload(chunk_storage_path, f.read(), file_options={"content-type": "video/mp4"})
                
                # Get signed URL for Kling
                signed_url_result = self.supabase.storage.from_("vannilli").create_signed_url(chunk_storage_path, 3600)
                if isinstance(signed_url_result, tuple):
                    signed_url_result = signed_url_result[0] if signed_url_result else {}
                elif hasattr(signed_url_result, 'signedUrl'):
                    signed_url_result = {"signedUrl": signed_url_result.signedUrl}
                elif hasattr(signed_url_result, 'signed_url'):
                    signed_url_result = {"signed_url": signed_url_result.signed_url}
                
                chunk_url = signed_url_result.get("signedUrl") or signed_url_result.get("signed_url") if isinstance(signed_url_result, dict) else None
                
                if not chunk_url:
                    raise Exception(f"Failed to create signed URL for chunk {i+1}")
                
                print(f"[orchestrator] Calling Kling API for chunk {i+1}...")
                task_id = self.kling_client.generate(chunk_url, current_image, prompt)
                
                # Poll for completion
                status, kling_video_url = self.kling_client.poll_status(task_id)
                if status != "succeed" or not kling_video_url:
                    raise Exception(f"Kling generation failed for chunk {i+1}")
                
                # Download Kling output
                kling_output_path = chunks_dir / f"kling_chunk_{i:03d}.mp4"
                r = requests.get(kling_video_url, timeout=120)
                r.raise_for_status()
                kling_output_path.write_bytes(r.content)
                
                # B. Mathematical audio slicing (no new sync)
                chunk_start_time = (i * effective_chunk_size) + global_offset
                actual_chunk_duration = min(effective_chunk_size, duration - (i * effective_chunk_size))
                
                audio_slice_path = chunks_dir / f"audio_chunk_{i:03d}.wav"
                self.extract_audio_slice(master_audio_path, chunk_start_time, actual_chunk_duration, audio_slice_path)
                
                # C. Mux (combine AI video + clean audio)
                segment_path = chunks_dir / f"segment_{i:03d}.mp4"
                self.mux_video_audio(kling_output_path, audio_slice_path, segment_path)
                final_segments.append(segment_path)
            
            # 4. Final output
            final_output_path = work_path / "final.mp4"
            if len(final_segments) > 1:
                print("[orchestrator] Stitching segments...")
                self.stitch_segments(final_segments, final_output_path)
            else:
                final_output_path = final_segments[0]
            
            # Copy to persistent location (or upload to storage)
            # For now, return the path (caller handles upload)
            return final_output_path
