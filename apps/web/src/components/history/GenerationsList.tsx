'use client';

import { GlassCard } from '../ui/GlassCard';

export interface Generation {
  id: string;
  internal_task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
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

interface GenerationsListProps {
  generations: Generation[];
}

const statusConfig = {
  pending: { label: 'Queued', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  processing: { label: 'Processing', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  completed: { label: 'Completed', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
  failed: { label: 'Failed', color: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

export function GenerationsList({ generations }: GenerationsListProps) {
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
                {generation.status === 'completed' && generation.final_video_r2_path && (
                  <a
                    href={`/api/download/${generation.id}`}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-all tap-effect"
                  >
                    Download
                  </a>
                )}
                {generation.status === 'failed' && generation.error_message && (
                  <p className="text-xs text-red-400 max-w-xs text-right">
                    {generation.error_message}
                  </p>
                )}
              </div>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}
