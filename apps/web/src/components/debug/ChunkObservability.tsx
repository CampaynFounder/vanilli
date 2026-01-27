'use client';

import { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';

interface ChunkInfo {
  chunkIndex: number;
  videoStartTime: number;
  videoEndTime: number;
  audioStartTime: number;
  audioEndTime: number;
  imageIndex: number;
  imageUrl: string;
  syncOffset: number;
  chunkDuration: number;
}

interface ChunkObservabilityProps {
  videoUrl: string;
  audioUrl: string;
  images: string[];
  syncOffset: number;
  chunkDuration: number;
}

export function ChunkObservability({
  videoUrl,
  audioUrl,
  images,
  syncOffset,
  chunkDuration,
}: ChunkObservabilityProps) {
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chunks, setChunks] = useState<ChunkInfo[]>([]);

  const calculateChunks = () => {
    const validImages = images.filter((url) => url.trim() !== '');
    
    if (!videoUrl || videoUrl.trim() === '') {
      setError('Video URL is required');
      return;
    }
    if (!chunkDuration || chunkDuration <= 0) {
      setError('Chunk duration must be greater than 0');
      return;
    }
    if (validImages.length === 0) {
      setError('At least one image URL is required');
      return;
    }

    setError(null);
    setLoading(true);

    // Get video duration from video element
    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';

    video.addEventListener('loadedmetadata', () => {
      const duration = video.duration;
      setVideoDuration(duration);

      // Calculate chunks (same logic as worker)
      const numChunks = Math.ceil(duration / chunkDuration);
      const calculatedChunks: ChunkInfo[] = [];

      for (let i = 0; i < numChunks; i++) {
        const videoStartTime = i * chunkDuration;
        const videoEndTime = Math.min(videoStartTime + chunkDuration, duration);
        const audioStartTime = videoStartTime + (syncOffset || 0);
        const audioEndTime = audioStartTime + chunkDuration;
        const imageIndex = i % validImages.length;

        calculatedChunks.push({
          chunkIndex: i,
          videoStartTime,
          videoEndTime,
          audioStartTime,
          audioEndTime,
          imageIndex,
          imageUrl: validImages[imageIndex],
          syncOffset: syncOffset || 0,
          chunkDuration,
        });
      }

      setChunks(calculatedChunks);
      setLoading(false);
    });

    video.addEventListener('error', () => {
      setError('Failed to load video. Make sure the URL is accessible and CORS is enabled.');
      setLoading(false);
    });

    video.load();
  };

  const validateSync = (chunk: ChunkInfo): { valid: boolean; message: string } => {
    const calculatedAudioStart = chunk.videoStartTime + chunk.syncOffset;
    const diff = Math.abs(chunk.audioStartTime - calculatedAudioStart);
    
    if (diff > 0.001) {
      return {
        valid: false,
        message: `Audio start time mismatch: expected ${calculatedAudioStart.toFixed(3)}s, got ${chunk.audioStartTime.toFixed(3)}s`,
      };
    }

    return { valid: true, message: '✓ Synchronized' };
  };

  const validateImageRotation = (chunk: ChunkInfo): { valid: boolean; message: string } => {
    const validImages = images.filter((url) => url.trim() !== '');
    if (validImages.length === 0) return { valid: false, message: 'No valid images' };
    
    const expectedImageIndex = chunk.chunkIndex % validImages.length;
    if (chunk.imageIndex !== expectedImageIndex) {
      return {
        valid: false,
        message: `Image index mismatch: expected ${expectedImageIndex}, got ${chunk.imageIndex}`,
      };
    }
    return { valid: true, message: '✓ Correct image rotation' };
  };

  return (
    <GlassCard className="p-6">
      <h2 className="text-xl font-bold mb-4">Chunk Observability Preview</h2>
      <p className="text-sm text-slate-400 mb-4">
        Preview chunk calculations without sending to Kling. Verify synchronization and image pairing before processing.
      </p>

      <div className="space-y-4 mb-4">
        <div className="p-3 bg-slate-900/30 rounded text-sm space-y-2">
          <div>
            <span className="text-slate-400">Video URL:</span>{' '}
            <span className="text-slate-300 truncate block">{videoUrl || '(not set)'}</span>
          </div>
          <div>
            <span className="text-slate-400">Audio URL:</span>{' '}
            <span className="text-slate-300 truncate block">{audioUrl || '(not set)'}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-slate-400">Sync Offset:</span>{' '}
              <span className="text-slate-300">{syncOffset.toFixed(3)}s</span>
            </div>
            <div>
              <span className="text-slate-400">Chunk Duration:</span>{' '}
              <span className="text-slate-300">{chunkDuration.toFixed(3)}s</span>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Images ({images.length})</label>
          <div className="space-y-2">
            {images.map((url, idx) => (
              <div key={idx} className="text-xs text-slate-400 truncate">
                [{idx}] {url}
              </div>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={calculateChunks}
        disabled={loading || !videoUrl || !chunkDuration || images.filter((url) => url.trim() !== '').length === 0}
        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium"
      >
        {loading ? 'Calculating...' : 'Calculate Chunks'}
      </button>

      {error && (
        <div className="mt-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      {videoDuration !== null && (
        <div className="mt-4 p-3 bg-slate-900/50 rounded text-sm">
          <strong>Video Duration:</strong> {videoDuration.toFixed(3)}s
          <br />
          <strong>Number of Chunks:</strong> {chunks.length}
          <br />
          <strong>Total Processing Time (est.):</strong> ~{Math.ceil(chunks.length * 75 / 60)} minutes
        </div>
      )}

      {chunks.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3">Chunk Details</h3>
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {chunks.map((chunk) => {
              const syncValidation = validateSync(chunk);
              const imageValidation = validateImageRotation(chunk);
              const allValid = syncValidation.valid && imageValidation.valid;

              return (
                <div
                  key={chunk.chunkIndex}
                  className={`p-4 rounded border ${
                    allValid
                      ? 'bg-green-900/20 border-green-700/50'
                      : 'bg-red-900/20 border-red-700/50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-lg">
                        Chunk {chunk.chunkIndex + 1} / {chunks.length}
                      </h4>
                      <div className="text-xs text-slate-400 mt-1">
                        Status: {allValid ? '✓ Valid' : '✗ Issues detected'}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="text-slate-400">Image Index</div>
                      <div className="font-mono">{chunk.imageIndex}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                    <div>
                      <div className="text-slate-400 text-xs mb-1">Video Timing</div>
                      <div className="font-mono">
                        {chunk.videoStartTime.toFixed(3)}s → {chunk.videoEndTime.toFixed(3)}s
                      </div>
                      <div className="text-xs text-slate-500">
                        Duration: {chunk.chunkDuration.toFixed(3)}s
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs mb-1">Audio Timing</div>
                      <div className="font-mono">
                        {chunk.audioStartTime.toFixed(3)}s → {chunk.audioEndTime.toFixed(3)}s
                      </div>
                      <div className="text-xs text-slate-500">
                        Offset: {chunk.syncOffset >= 0 ? '+' : ''}{chunk.syncOffset.toFixed(3)}s
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <div className="text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={syncValidation.valid ? 'text-green-400' : 'text-red-400'}>
                          {syncValidation.valid ? '✓' : '✗'}
                        </span>
                        <span className={syncValidation.valid ? 'text-green-300' : 'text-red-300'}>
                          {syncValidation.message}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={imageValidation.valid ? 'text-green-400' : 'text-red-400'}>
                          {imageValidation.valid ? '✓' : '✗'}
                        </span>
                        <span className={imageValidation.valid ? 'text-green-300' : 'text-red-300'}>
                          {imageValidation.message}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <div className="text-xs">
                      <div className="text-slate-400 mb-1">Image URL:</div>
                      <div className="text-slate-300 truncate font-mono">{chunk.imageUrl}</div>
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-slate-500">
                    <div>
                      Expected: Video[{chunk.chunkIndex}] + Audio[{chunk.chunkIndex}] + Image[{chunk.imageIndex}]
                    </div>
                    <div className="mt-1">
                      Audio start = Video start ({chunk.videoStartTime.toFixed(3)}s) + Sync offset ({chunk.syncOffset.toFixed(3)}s) = {chunk.audioStartTime.toFixed(3)}s
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 p-4 bg-slate-900/50 rounded">
            <h4 className="font-semibold mb-2">Summary</h4>
            <div className="text-sm space-y-1">
              <div>
                Valid chunks: {chunks.filter((c) => validateSync(c).valid && validateImageRotation(c).valid).length} / {chunks.length}
              </div>
              <div>
                Sync issues: {chunks.filter((c) => !validateSync(c).valid).length}
              </div>
              <div>
                Image rotation issues: {chunks.filter((c) => !validateImageRotation(c).valid).length}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-700">
                <div className="text-xs text-slate-400">
                  Image rotation pattern: {images.filter((url) => url.trim() !== '').map((_, idx) => idx).join(', ')} (repeats every {images.filter((url) => url.trim() !== '').length} chunks)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
