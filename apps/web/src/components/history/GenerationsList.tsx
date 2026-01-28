'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { GlassCard } from '../ui/GlassCard';
import { sanitizeForUser } from '@/lib/utils';

export interface Generation {
  id: string;
  internal_task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  cost_credits: number;
  created_at: string;
  completed_at?: string;
  error_message?: string;
  final_video_r2_path?: string;
  progress_percentage?: number | null;
  current_stage?: string | null;
  estimated_completion_at?: string | null;
  thumbnail_r2_path?: string | null;
  projects?: {
    track_name: string;
    bpm: number;
    bars: number;
  } | null;
  video_jobs?: {
    user_video_url?: string;
    target_images?: string[];
    prompt?: string | null;
    user_bpm?: number | null;
    bpm?: number | null; // Calculated BPM from analysis
  } | null;
}

interface VideoChunk {
  id: string;
  chunk_index: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  video_url: string | null;
  error_message: string | null;
  credits_charged: number;
}

interface GenerationsListProps {
  generations: Generation[];
  userId?: string;
  onRefresh?: () => void;
}

const statusConfig: Record<'pending' | 'processing' | 'completed' | 'failed' | 'cancelled', { label: string; color: string }> = {
  pending: { label: 'Queued', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  processing: { label: 'Processing', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  completed: { label: 'Completed', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
  failed: { label: 'Failed', color: 'bg-red-500/20 text-red-300 border-red-500/30' },
  cancelled: { label: 'Cancelled', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
};

export function GenerationsList({ generations, userId, onRefresh }: GenerationsListProps) {
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadErrorId, setDownloadErrorId] = useState<string | null>(null);
  const [chunksByGeneration, setChunksByGeneration] = useState<Record<string, VideoChunk[]>>({});
  const [expandedGenerations, setExpandedGenerations] = useState<Set<string>>(new Set());
  const [processingGenerations, setProcessingGenerations] = useState<Set<string>>(new Set());
  const [generationProgress, setGenerationProgress] = useState<Record<string, number>>({});
  const [generationTimeRemaining, setGenerationTimeRemaining] = useState<Record<string, number>>({});
  const [deletingGenerations, setDeletingGenerations] = useState<Set<string>>(new Set());
  
  // Fetch chunks for generations
  useEffect(() => {
    const fetchChunks = async () => {
      const chunksMap: Record<string, VideoChunk[]> = {};
      for (const gen of generations) {
        const { data } = await supabase
          .from('video_chunks')
          .select('*')
          .eq('generation_id', gen.id)
          .order('chunk_index', { ascending: true });
        if (data && data.length > 0) {
          chunksMap[gen.id] = data as VideoChunk[];
        }
      }
      setChunksByGeneration(chunksMap);
    };
    if (generations.length > 0) {
      fetchChunks();
    }
  }, [generations]);
  
  // Poll for progress updates on processing generations
  useEffect(() => {
    const processingIds = generations
      .filter(g => g.status === 'processing' || g.status === 'pending')
      .map(g => g.id);
    
    if (processingIds.length === 0) {
      setProcessingGenerations(new Set());
      return;
    }
    
    setProcessingGenerations(new Set(processingIds));
    
    const poll = async () => {
      for (const id of processingIds) {
        try {
          const { data } = await supabase
            .from('generations')
            .select('progress_percentage, estimated_completion_at, status')
            .eq('id', id)
            .single();
          
          if (data) {
            if (data.progress_percentage != null) {
              setGenerationProgress(prev => ({ ...prev, [id]: data.progress_percentage }));
            }
            
            if (data.estimated_completion_at) {
              const estimated = new Date(data.estimated_completion_at).getTime();
              const now = Date.now();
              const remaining = Math.max(0, Math.floor((estimated - now) / 1000));
              setGenerationTimeRemaining(prev => ({ ...prev, [id]: remaining }));
            }
            
            // If completed or failed, refresh the list
            if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
              if (onRefresh) onRefresh();
            }
          }
        } catch (e) {
          console.error(`[history] Error polling generation ${id}:`, e);
        }
      }
    };
    
    poll();
    const interval = setInterval(poll, 3000); // Poll every 3 seconds
    
    return () => clearInterval(interval);
  }, [generations, onRefresh]);
  
  // Real-time countdown for processing generations
  useEffect(() => {
    const processingIds = Array.from(processingGenerations);
    if (processingIds.length === 0) return;
    
    const interval = setInterval(() => {
      setGenerationTimeRemaining(prev => {
        const updated = { ...prev };
        for (const id of processingIds) {
          if (updated[id] != null && updated[id] > 0) {
            updated[id] = updated[id] - 1;
          }
        }
        return updated;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [processingGenerations]);

  const handleDownload = async (generation: Generation, chunkIndex?: number) => {
    const downloadKey = chunkIndex !== undefined ? `${generation.id}-chunk-${chunkIndex}` : generation.id;
    setDownloadId(downloadKey);
    setDownloadError(null);
    setDownloadErrorId(null);
    try {
      let path: string;
      let filename: string;
      
      if (chunkIndex !== undefined) {
        // Download individual chunk
        const chunks = chunksByGeneration[generation.id];
        const chunk = chunks?.[chunkIndex];
        if (!chunk?.video_url) {
          setDownloadError('Chunk not available');
          setDownloadErrorId(downloadKey);
          return;
        }
        path = chunk.video_url;
        filename = `vannilli-scene-${chunkIndex + 1}-${generation.id}.mp4`;
      } else {
        // Download final video
        path = generation.final_video_r2_path || `outputs/${generation.id}/final.mp4`;
        filename = `vannilli-video-${generation.id}.mp4`;
      }
      
      // If path is already a full URL, use it directly
      // Use fetch-based download to prevent new tab navigation
      let downloadUrl: string;
      if (path.startsWith('http')) {
        downloadUrl = path;
      } else {
        // Create signed URL from storage path
        // Ensure path doesn't have leading slash (Supabase expects relative path)
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;
        console.log(`[GenerationsList] Creating signed URL for path: ${cleanPath}`);
        const { data, error } = await supabase.storage.from('vannilli').createSignedUrl(cleanPath, 3600);
        if (error || !data?.signedUrl) {
          console.error(`[GenerationsList] Failed to create signed URL:`, error);
          console.error(`[GenerationsList] Path used: ${cleanPath}`);
          console.error(`[GenerationsList] Generation ID: ${generation.id}`);
          console.error(`[GenerationsList] final_video_r2_path: ${generation.final_video_r2_path}`);
          setDownloadError(error?.message || 'Download link not available. The video may not have been uploaded yet.');
          setDownloadErrorId(downloadKey);
          return;
        }
        downloadUrl = data.signedUrl;
      }
      
      // Fetch and download as blob to prevent new tab
      try {
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.target = '_self';
        link.rel = 'noopener noreferrer';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        requestAnimationFrame(() => {
          if (link.parentNode) {
            document.body.removeChild(link);
          }
          window.URL.revokeObjectURL(url);
        });
      } catch (err) {
        console.error('[history] Download failed:', err);
        setDownloadError(err instanceof Error ? err.message : 'Download failed');
        setDownloadErrorId(downloadKey);
      }
    } catch (err) {
      setDownloadError('Download failed. Please try again.');
      setDownloadErrorId(downloadKey);
    } finally {
      setDownloadId(null);
    }
  };
  
  const toggleChunks = (generationId: string) => {
    const newExpanded = new Set(expandedGenerations);
    if (newExpanded.has(generationId)) {
      newExpanded.delete(generationId);
    } else {
      newExpanded.add(generationId);
    }
    setExpandedGenerations(newExpanded);
  };

  if (generations.length === 0) {
    return (
      <GlassCard className="text-center py-12">
        <div className="text-4xl mb-3">🎬</div>
        <p className="text-slate-400">No generations yet. Create your first video in the Studio!</p>
      </GlassCard>
    );
  }

  // Helper to get display name for generation
  const getGenerationName = (gen: Generation): string => {
    if (gen.projects?.track_name) {
      return gen.projects.track_name;
    }
    if (gen.video_jobs?.user_video_url) {
      const url = gen.video_jobs.user_video_url;
      const filename = url.split('/').pop() || 'Video';
      return filename.replace(/\.[^/.]+$/, ''); // Remove extension
    }
    return 'Untitled Generation';
  };
  
  // Thumbnail component - static image for most statuses
  const ThumbnailImage = ({ path, alt }: { path: string; alt: string }) => {
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
    
    useEffect(() => {
      const loadThumbnail = async () => {
        try {
          const { data, error } = await supabase.storage.from('vannilli').createSignedUrl(path, 3600);
          if (!error && data?.signedUrl) {
            setThumbnailUrl(data.signedUrl);
          }
        } catch (e) {
          console.error('[history] Error loading thumbnail:', e);
        }
      };
      loadThumbnail();
    }, [path]);
    
    if (!thumbnailUrl) {
      return <div className="text-2xl">🎬</div>;
    }
    
    return (
      <img 
        src={thumbnailUrl}
        alt={alt}
        className="w-full h-full object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  };

  // Video scrubbing thumbnail - only for pending/processing status
  const VideoScrubbingThumbnail = ({ videoUrl }: { videoUrl: string }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [signedUrl, setSignedUrl] = useState<string | null>(null);
    
    useEffect(() => {
      const loadVideo = async () => {
        try {
          const { data, error } = await supabase.storage.from('vannilli').createSignedUrl(videoUrl, 3600);
          if (!error && data?.signedUrl) {
            setSignedUrl(data.signedUrl);
          }
        } catch (e) {
          console.error('[history] Error loading video for scrubbing:', e);
        }
      };
      loadVideo();
    }, [videoUrl]);
    
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!videoRef.current || !containerRef.current || !signedUrl) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      
      if (videoRef.current.duration) {
        videoRef.current.currentTime = percentage * videoRef.current.duration;
      }
    };
    
    if (!signedUrl) {
      return <div className="text-2xl">⏳</div>;
    }
    
    return (
      <div
        ref={containerRef}
        className="w-full h-full relative cursor-pointer"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          if (videoRef.current) {
            videoRef.current.currentTime = 0;
          }
        }}
      >
        <video
          ref={videoRef}
          src={signedUrl}
          className="w-full h-full object-cover"
          muted
          preload="metadata"
          playsInline
        />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {generations.map((generation) => {
        const config = statusConfig[generation.status];
        const displayName = getGenerationName(generation);
        const progress = generationProgress[generation.id] ?? generation.progress_percentage ?? 0;
        const timeRemaining = generationTimeRemaining[generation.id];
        const isProcessing = generation.status === 'processing' || generation.status === 'pending';
        
        return (
          <GlassCard key={generation.id} elevated className="card-3d">
            <div className="flex items-start gap-4">
              {/* Thumbnail */}
              <div className="flex-shrink-0 w-32 h-20 bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center relative">
                {isProcessing && generation.video_jobs?.user_video_url ? (
                  // Live video scrubbing for pending/processing status
                  <VideoScrubbingThumbnail 
                    videoUrl={generation.video_jobs.user_video_url}
                  />
                ) : generation.thumbnail_r2_path && (generation.status === 'completed' || generation.status === 'failed' || generation.status === 'cancelled') ? (
                  // Static thumbnail for completed/failed/cancelled
                  <ThumbnailImage 
                    path={generation.thumbnail_r2_path} 
                    alt={displayName}
                  />
                ) : isProcessing ? (
                  <div className="text-4xl">⏳</div>
                ) : generation.status === 'completed' ? (
                  <div className="text-4xl">✅</div>
                ) : generation.status === 'failed' ? (
                  <div className="text-4xl">❌</div>
                ) : (
                  <div className="text-4xl">🎬</div>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white mb-1 truncate">
                      {displayName}
                    </h3>
                    <div className="flex items-center gap-3 text-sm text-slate-400 mb-2 flex-wrap">
                      {/* Show BPM from projects (legacy) or video_jobs (new system) */}
                      {(generation.projects || generation.video_jobs) && (
                        <>
                          <span>
                            {generation.projects?.bpm || 
                             generation.video_jobs?.user_bpm || 
                             generation.video_jobs?.bpm || 
                             'N/A'} BPM
                            {generation.video_jobs?.user_bpm && (
                              <span className="text-xs text-purple-400 ml-1" title="User-provided BPM">(user)</span>
                            )}
                          </span>
                          <span>•</span>
                          {generation.projects && (
                            <>
                              <span>{generation.projects.bars} bars</span>
                              <span>•</span>
                            </>
                          )}
                        </>
                      )}
                      <span className="font-semibold text-purple-400">
                        {generation.cost_credits} credits {generation.status === 'processing' || generation.status === 'pending' ? '(deducted)' : ''}
                      </span>
                      {generation.video_jobs?.prompt && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-xs" title={generation.video_jobs.prompt}>
                            {generation.video_jobs.prompt}
                          </span>
                        </>
                      )}
                    </div>
                    
                    {/* Progress bar for processing generations */}
                    {isProcessing && (
                      <div className="mb-2">
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                          <span>Progress: {progress}%</span>
                          {timeRemaining != null && timeRemaining > 0 && (
                            <span>
                              {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')} remaining
                            </span>
                          )}
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2">
                          <div
                            className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${Math.max(5, progress)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    
                    <div className="text-xs text-slate-500">
                      {new Date(generation.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${config.color}`}>
                      {config.label}
                    </div>
                {generation.status === 'completed' && (
                  <button
                    onClick={() => handleDownload(generation)}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-all tap-effect disabled:opacity-60"
                    disabled={downloadId === generation.id}
                  >
                    {downloadId === generation.id ? 'Preparing...' : 'Download Final'}
                  </button>
                )}
                {(generation.status === 'processing' || generation.status === 'pending') && userId && (
                  <button
                    onClick={async () => {
                      if (!userId) return;
                      if (!confirm('Are you sure you want to cancel this generation? Credits will not be deducted.')) {
                        return;
                      }
                      try {
                        const { error } = await supabase.rpc('cancel_generation', {
                          generation_uuid: generation.id,
                          user_uuid: userId,
                        });
                        if (error) {
                          console.error('[history] Cancel error:', error);
                          alert('Failed to cancel generation. Please try again.');
                        } else {
                          if (onRefresh) onRefresh();
                        }
                      } catch (e) {
                        console.error('[history] Cancel exception:', e);
                        alert('Failed to cancel generation. Please try again.');
                      }
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-all"
                  >
                    Cancel
                  </button>
                )}
                {generation.status === 'failed' && generation.error_message && (
                  <p className="text-xs text-red-400 max-w-xs text-right">
                    {sanitizeForUser(generation.error_message)}
                  </p>
                )}
                {generation.status === 'cancelled' && (
                  <p className="text-xs text-orange-400 max-w-xs text-right">
                    Cancelled by user
                  </p>
                )}
                {/* Delete button for completed, failed, or cancelled generations */}
                {(generation.status === 'completed' || generation.status === 'failed' || generation.status === 'cancelled') && (
                  <button
                    onClick={async () => {
                      if (!userId) return;
                      const statusLabel = generation.status === 'completed' ? 'completed' : generation.status === 'failed' ? 'failed' : 'cancelled';
                      if (!confirm(`Are you sure you want to delete this ${statusLabel} generation? This action cannot be undone.`)) {
                        return;
                      }
                      setDeletingGenerations(prev => new Set(prev).add(generation.id));
                      try {
                        const { error } = await supabase.rpc('delete_generation', {
                          generation_uuid: generation.id,
                          user_uuid: userId,
                        });
                        if (error) {
                          console.error('[history] Delete error:', error);
                          alert(`Failed to delete generation: ${error.message || 'Unknown error'}`);
                          setDeletingGenerations(prev => {
                            const next = new Set(prev);
                            next.delete(generation.id);
                            return next;
                          });
                        } else {
                          // Successfully deleted, refresh the list
                          if (onRefresh) onRefresh();
                        }
                      } catch (e) {
                        console.error('[history] Delete exception:', e);
                        alert(`Failed to delete generation: ${e instanceof Error ? e.message : 'Unknown error'}`);
                        setDeletingGenerations(prev => {
                          const next = new Set(prev);
                          next.delete(generation.id);
                          return next;
                        });
                      }
                    }}
                    disabled={deletingGenerations.has(generation.id)}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-all"
                  >
                    {deletingGenerations.has(generation.id) ? 'Deleting...' : 'Delete'}
                  </button>
                )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Show chunks if available */}
            {chunksByGeneration[generation.id] && chunksByGeneration[generation.id].length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <button
                  onClick={() => toggleChunks(generation.id)}
                  className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-2"
                >
                  <svg 
                    className={`w-4 h-4 transition-transform ${expandedGenerations.has(generation.id) ? 'rotate-90' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  {chunksByGeneration[generation.id].length} Scene{chunksByGeneration[generation.id].length !== 1 ? 's' : ''} Available
                </button>
                
                {expandedGenerations.has(generation.id) && (
                  <div className="mt-3 space-y-2">
                    {chunksByGeneration[generation.id].map((chunk) => (
                      <div key={chunk.id} className="flex items-center justify-between p-2 bg-slate-800/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-400">Scene {chunk.chunk_index + 1}</span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            chunk.status === 'COMPLETED' ? 'bg-green-500/20 text-green-300' :
                            chunk.status === 'PROCESSING' ? 'bg-blue-500/20 text-blue-300' :
                            chunk.status === 'FAILED' ? 'bg-red-500/20 text-red-300' :
                            'bg-yellow-500/20 text-yellow-300'
                          }`}>
                            {chunk.status}
                          </span>
                          {chunk.credits_charged > 0 && (
                            <span className="text-xs text-slate-500">{chunk.credits_charged} credits</span>
                          )}
                        </div>
                        {chunk.status === 'COMPLETED' && chunk.video_url && (
                          <button
                            onClick={() => handleDownload(generation, chunk.chunk_index)}
                            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded transition-all disabled:opacity-60"
                            disabled={downloadId === `${generation.id}-chunk-${chunk.chunk_index}`}
                          >
                            {downloadId === `${generation.id}-chunk-${chunk.chunk_index}` ? 'Preparing...' : 'Download'}
                          </button>
                        )}
                        {chunk.status === 'FAILED' && chunk.error_message && (
                          <p className="text-xs text-red-400 max-w-xs">{sanitizeForUser(chunk.error_message)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {downloadError && downloadErrorId === generation.id && (
              <div className="mt-3 text-xs text-red-400 text-right">{downloadError}</div>
            )}
          </GlassCard>
        );
      })}
    </div>
  );
}
