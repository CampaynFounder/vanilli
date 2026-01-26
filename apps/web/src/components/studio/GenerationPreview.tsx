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
}

export function GenerationPreview({ status, progress, placeholderImage, onDownloadClick, onCreateAnother }: GenerationPreviewProps) {
  const [showNoise, setShowNoise] = useState(true);

  useEffect(() => {
    if (status === 'processing') {
      // Fade out noise after 2 seconds
      const timer = setTimeout(() => setShowNoise(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [status]);

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

        {/* Progress overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="text-center">
            <ProgressRing progress={progress} size={120} />
            <p className="mt-4 text-white font-semibold">Syncing your performance...</p>
            <p className="text-xs text-slate-400 mt-1">This usually takes 60-90 seconds</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="relative aspect-video bg-slate-900 rounded-3xl overflow-hidden glass-card-elevated">
        <div className="flex items-center justify-center h-full">
          <div className="text-center space-y-3">
            <div className="text-6xl mb-4">✅</div>
            <p className="text-2xl font-bold text-white mb-2">Video Ready!</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={onDownloadClick}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-all tap-effect animate-glow-pulse"
              >
                Download Video
              </button>
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
