'use client';

import { useState, useEffect } from 'react';
import { NoiseTexture } from '../ui/NoiseTexture';
import { ProgressRing } from '../ui/ProgressRing';

interface GenerationPreviewProps {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  placeholderImage?: string;
  /** When provided, the completed-state Download button calls this (e.g. to fetch /api/download and open URL). */
  onDownloadClick?: () => void;
  /** When provided, completed state shows "Create another" — call when user has 9+ credits to reset flow. */
  onCreateAnother?: () => void;
  /** Signed URL for the completed video (for preview/playback). */
  videoUrl?: string | Promise<string | null> | null;
}

export function GenerationPreview({ status, progress, placeholderImage, onDownloadClick, onCreateAnother, videoUrl, estimatedTimeRemaining }: GenerationPreviewProps & { estimatedTimeRemaining?: number | null }) {
  const [showNoise, setShowNoise] = useState(true);
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'processing') {
      // Fade out noise after 2 seconds
      const timer = setTimeout(() => setShowNoise(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  // Resolve videoUrl promise if needed
  useEffect(() => {
    if (status === 'completed' && videoUrl) {
      if (typeof videoUrl === 'string') {
        setResolvedVideoUrl(videoUrl);
      } else if (videoUrl instanceof Promise) {
        videoUrl.then((url) => setResolvedVideoUrl(url || null)).catch(() => setResolvedVideoUrl(null));
      } else {
        setResolvedVideoUrl(null);
      }
    } else {
      setResolvedVideoUrl(null);
    }
  }, [status, videoUrl]);

  if (status === 'pending') {
    return (
      <div className="relative aspect-video bg-gradient-to-br from-purple-900 to-black rounded-3xl overflow-hidden flex items-center justify-center">
        <ProgressRing progress={0} size={120} />
      </div>
    );
  }

  if (status === 'processing') {
    return (
      <div className="relative aspect-video bg-gradient-to-br from-purple-900 to-black rounded-3xl overflow-hidden">
        {/* Animated scanning line */}
        <div className="absolute inset-0 animate-scan bg-gradient-to-b from-transparent via-purple-400/30 to-transparent pointer-events-none" />
        
        {/* Noise texture that fades out */}
        {showNoise && (
          <div className="absolute inset-0 opacity-50 animate-fade-out">
            <NoiseTexture />
          </div>
        )}
        
        {/* Progressive blur reveal */}
        {placeholderImage && (
          <img 
            src={placeholderImage} 
            alt="Preview"
            className="w-full h-full object-contain bg-black/40 blur-xl animate-unblur"
          />
        )}

        {/* Progress overlay - centered */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="text-center flex flex-col items-center justify-center w-full h-full">
            <ProgressRing progress={Math.max(10, progress)} size={120} />
            <p className="mt-4 text-white font-semibold">Processing your video...</p>
            {estimatedTimeRemaining !== null && estimatedTimeRemaining > 0 ? (
              <p className="text-xs text-slate-400 mt-1">
                Estimated time remaining: {Math.floor(estimatedTimeRemaining / 60)}:{(estimatedTimeRemaining % 60).toString().padStart(2, '0')}
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-1">This usually takes 60-90 seconds</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="relative aspect-video bg-slate-900 rounded-3xl overflow-hidden glass-card-elevated">
        {resolvedVideoUrl ? (
          <>
            <video
              src={resolvedVideoUrl}
              controls
              className="w-full h-full object-contain bg-black"
              preload="metadata"
            />
            <div className="absolute bottom-4 left-0 right-0 flex flex-wrap gap-3 justify-center px-4">
              {onDownloadClick && (
                <button
                  onClick={onDownloadClick}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-all tap-effect animate-glow-pulse shadow-lg"
                >
                  Download Video
                </button>
              )}
              {onCreateAnother && (
                <button
                  onClick={onCreateAnother}
                  className="px-6 py-3 bg-slate-600 hover:bg-slate-500 text-white font-semibold rounded-lg transition-all shadow-lg"
                >
                  Create another
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="text-6xl mb-4">✅</div>
              <p className="text-2xl font-bold text-white mb-2">Video Ready!</p>
              <div className="flex flex-wrap gap-3 justify-center">
                {onDownloadClick && (
                  <button
                    onClick={onDownloadClick}
                    className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-all tap-effect animate-glow-pulse"
                  >
                    Download Video
                  </button>
                )}
                {onCreateAnother && (
                  <button
                    onClick={onCreateAnother}
                    className="px-6 py-3 bg-slate-600 hover:bg-slate-500 text-white font-semibold rounded-lg transition-all"
                  >
                    Create another
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Failed state
  return (
    <div className="relative aspect-video bg-slate-900 rounded-3xl overflow-hidden glass-card border-2 border-red-500/30">
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-6">
          <div className="text-6xl mb-4">❌</div>
          <p className="text-2xl font-bold text-white mb-2">Generation Failed</p>
          <p className="text-sm text-slate-400">No credits were deducted</p>
        </div>
      </div>
    </div>
  );
}
