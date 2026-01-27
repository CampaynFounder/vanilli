'use client';

import { useState, useEffect } from 'react';
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
  projects: {
    track_name: string;
    bpm: number;
    bars: number;
  };
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
        filename = `vannilli-chunk-${chunkIndex + 1}-${generation.id}.mp4`;
      } else {
        // Download final video
        path = generation.final_video_r2_path || `outputs/${generation.id}/final.mp4`;
        filename = `vannilli-video-${generation.id}.mp4`;
      }
      
      // If path is already a full URL, use it directly
      if (path.startsWith('http')) {
        const a = document.createElement('a');
        a.href = path;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        // Create signed URL from storage path
        const { data, error } = await supabase.storage.from('vannilli').createSignedUrl(path, 3600);
        if (error || !data?.signedUrl) {
          setDownloadError(error?.message || 'Download link not available');
          setDownloadErrorId(downloadKey);
          return;
        }
        const a = document.createElement('a');
        a.href = data.signedUrl;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
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

  return (
    <div className="space-y-4">
      {generations.map((generation) => {
        const config = statusConfig[generation.status];
        return (
          <GlassCard key={generation.id} elevated className="card-3d">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-1">
                  {generation.projects.track_name}
                </h3>
                <div className="flex items-center gap-3 text-sm text-slate-400 mb-3">
                  <span>{generation.projects.bpm} BPM</span>
                  <span>•</span>
                  <span>{generation.projects.bars} bars</span>
                  <span>•</span>
                  <span>{generation.cost_credits} credits</span>
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(generation.created_at).toLocaleString()}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
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
                {generation.status === 'processing' && userId && (
                  <button
                    onClick={async () => {
                      if (!userId) return;
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
                  {chunksByGeneration[generation.id].length} Chunk{chunksByGeneration[generation.id].length !== 1 ? 's' : ''} Available
                </button>
                
                {expandedGenerations.has(generation.id) && (
                  <div className="mt-3 space-y-2">
                    {chunksByGeneration[generation.id].map((chunk) => (
                      <div key={chunk.id} className="flex items-center justify-between p-2 bg-slate-800/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-400">Chunk {chunk.chunk_index + 1}</span>
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
