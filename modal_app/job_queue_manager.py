"""JobQueueManager: Priority-based job queue with tier weighting."""
import os
from typing import Optional, Dict, Any


class JobQueueManager:
    """Manages video generation job queue with tier-based priority."""
    
    TIER_WEIGHTS = {
        "demo": 5,  # Highest priority (when enabled)
        "label": 4,
        "artist": 3,
        "open_mic": 2,
        "industry": 1,  # Lowest priority (heavy jobs)
    }
    
    def __init__(self, db_url: str, db_key: str):
        """Initialize queue manager.
        
        Args:
            db_url: Supabase URL
            db_key: Supabase service role key
        """
        from supabase import create_client
        self.supabase = create_client(db_url, db_key)
    
    def get_concurrency_limit(self) -> int:
        """Get dynamic concurrency limit from DB config (default 3)."""
        try:
            # Try to fetch from config table if it exists
            response = self.supabase.table("system_config").select("value").eq("key", "max_concurrent_jobs").single().execute()
            if response.data:
                return int(response.data.get("value", 3))
        except Exception:
            pass
        return 3  # Default
    
    def get_active_job_count(self) -> int:
        """Count jobs where status = 'PROCESSING'."""
        response = self.supabase.table("video_jobs").select("id", count="exact").eq("status", "PROCESSING").execute()
        return response.count or 0
    
    def fetch_next_job(self) -> Optional[Dict[str, Any]]:
        """Fetch next job using priority logic.
        
        Priority order:
        1. is_first_time = TRUE (highest)
        2. Tier weight (label=4, artist=3, open_mic=2, industry=1)
        3. created_at ASC (FIFO)
        
        Returns:
            Job dict or None if no jobs available
        """
        # Use RPC function for FOR UPDATE SKIP LOCKED (concurrency-safe)
        try:
            response = self.supabase.rpc("get_next_job").execute()
            if response.data and len(response.data) > 0:
                return response.data[0]
        except Exception as e:
            # Fallback: if RPC doesn't exist, use direct query (less safe for concurrency)
            print(f"[queue] RPC get_next_job not available, using fallback: {e}")
            return self._fetch_next_job_fallback()
        return None
    
    def _fetch_next_job_fallback(self) -> Optional[Dict[str, Any]]:
        """Fallback method using direct query (not concurrency-safe)."""
        # Build CASE statement for tier weights
        tier_case = ", ".join([f"WHEN '{tier}' THEN {weight}" for tier, weight in self.TIER_WEIGHTS.items()])
        
        # Note: This doesn't use FOR UPDATE SKIP LOCKED, so it's not safe for high concurrency
        # In production, use the RPC function
        response = self.supabase.table("video_jobs").select("*").eq("status", "PENDING").order("is_first_time", desc=True).order("tier", desc=False).order("created_at", desc=False).limit(1).execute()
        
        if response.data and len(response.data) > 0:
            job = response.data[0]
            # Manually apply tier weighting (since PostgREST doesn't support CASE in ORDER BY easily)
            # This is a simplified version - the RPC function should handle this properly
            return job
        return None
    
    def mark_job_processing(self, job_id: str):
        """Mark job as processing."""
        self.supabase.table("video_jobs").update({"status": "PROCESSING"}).eq("id", job_id).execute()
    
    def mark_job_complete(self, job_id: str, output_url: str):
        """Mark job as completed with output URL."""
        self.supabase.table("video_jobs").update({
            "status": "COMPLETED",
            "output_url": output_url,
        }).eq("id", job_id).execute()
    
    def mark_job_failed(self, job_id: str, error_message: str):
        """Mark job as failed with error message."""
        self.supabase.table("video_jobs").update({
            "status": "FAILED",
            "error_message": error_message,
        }).eq("id", job_id).execute()
