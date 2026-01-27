'use client';

import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';

interface GenerationFlowProps {
  hasVideo: boolean;
  hasImage: boolean;
  hasAudio: boolean;
  isGenerating: boolean;
  progress: number;
  currentStep: 'idle' | 'preparing' | 'lipsync' | 'syncing' | 'watermark' | 'finalizing' | 'complete';
  /** Called when user clicks Generate (only when all ready and duration valid). */
  onGenerate?: () => void;
  /** Error from duration validation (audio vs video mismatch, etc.). */
  durationError?: string | null;
  /** true = passed, false = failed, undefined = not yet validated. */
  durationValid?: boolean;
  /** Billable seconds when duration valid. */
  generationSeconds?: number | null;
  /** If false, Generate is disabled (need 3+ credits). Default true. */
  hasCredits?: boolean;
  /** When true, show "Link payment below for 3 free credits" instead of Get more. */
  showLinkCard?: boolean;
  /** When hasCredits false and !showLinkCard, use this href for the CTA. */
  getCreditsHref?: string;
}

export function GenerationFlow({
  hasVideo,
  hasImage,
  hasAudio,
  isGenerating,
  progress,
  currentStep,
  onGenerate,
  durationError,
  durationValid,
  generationSeconds,
  hasCredits = true,
  showLinkCard = false,
  getCreditsHref = '/pricing',
  estimatedTimeRemaining,
}: GenerationFlowProps & { estimatedTimeRemaining?: number | null }) {
  const steps = [
    { id: 'preparing', label: 'Preparing Your Files', icon: '⬇️' },
    { id: 'lipsync', label: 'Applying VANNILLI Lip-Sync', icon: '🎬' },
    { id: 'syncing', label: 'Syncing Your Audio', icon: '🎵' },
    { id: 'watermark', label: 'Adding VANNILLI Watermark', icon: '💧' },
    { id: 'finalizing', label: 'Finalizing Your Video', icon: '☁️' },
    { id: 'complete', label: 'Complete!', icon: '✅' },
  ];

  const allFilesReady = hasVideo && hasImage; // Audio is optional
  const canGenerate = allFilesReady && durationValid === true && hasCredits;

  const getStepStatus = (stepId: string) => {
    if (!isGenerating) return 'pending';
    const stepIndex = steps.findIndex(s => s.id === stepId);
    const currentIndex = steps.findIndex(s => s.id === currentStep);
    
    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  return (
    <GlassCard elevated>
      <h3 className="text-lg font-semibold text-white mb-4">VANNILLI Pipeline</h3>

      {/* Input Status */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className={`p-3 rounded-lg ${hasVideo ? 'bg-green-500/10 border border-green-500/30' : 'bg-slate-800/50 border border-slate-700'}`}>
          <div className="text-center">
            <div className="text-2xl mb-1">{hasVideo ? '🎥' : '⏹️'}</div>
            <div className={`text-xs font-medium ${hasVideo ? 'text-green-400' : 'text-slate-400'}`}>
              {hasVideo ? 'Video Ready' : 'No Video'}
            </div>
          </div>
        </div>
        <div className={`p-3 rounded-lg ${hasImage ? 'bg-green-500/10 border border-green-500/30' : 'bg-slate-800/50 border border-slate-700'}`}>
          <div className="text-center">
            <div className="text-2xl mb-1">{hasImage ? '🖼️' : '⏹️'}</div>
            <div className={`text-xs font-medium ${hasImage ? 'text-green-400' : 'text-slate-400'}`}>
              {hasImage ? 'Image Ready' : 'No Image'}
            </div>
          </div>
        </div>
        <div className={`p-3 rounded-lg ${hasAudio ? 'bg-green-500/10 border border-green-500/30' : 'bg-slate-800/50 border border-slate-700'}`}>
          <div className="text-center">
            <div className="text-2xl mb-1">{hasAudio ? '🎵' : '⏹️'}</div>
            <div className={`text-xs font-medium ${hasAudio ? 'text-green-400' : 'text-slate-400'}`}>
              {hasAudio ? 'Audio Ready' : 'No Audio'}
            </div>
          </div>
        </div>
      </div>

      {/* Processing Steps */}
      <div className="space-y-3">
        {steps.map((step) => {
          const status = getStepStatus(step.id);
          return (
            <div
              key={step.id}
              className={`
                p-3 rounded-lg transition-all
                ${status === 'complete' ? 'bg-green-500/10 border border-green-500/30' : ''}
                ${status === 'active' ? 'bg-purple-500/10 border border-purple-500/30 animate-pulse' : ''}
                ${status === 'pending' ? 'bg-slate-800/50 border border-slate-700' : ''}
              `}
            >
              <div className="flex items-center gap-3">
                <div className="text-2xl">{step.icon}</div>
                <div className="flex-1">
                  <div className={`text-sm font-medium ${status === 'pending' ? 'text-slate-400' : 'text-white'}`}>
                    {step.label}
                  </div>
                  {status === 'active' && (
                    <div className="mt-1">
                      <div className="w-full bg-slate-800 rounded-full h-1.5 relative">
                        <div
                          className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${Math.max(10, progress)}%` }}
                        />
                      </div>
                      {estimatedTimeRemaining != null && estimatedTimeRemaining > 0 && (
                        <p className="text-xs text-slate-400 mt-1">
                          Estimated time remaining: {Math.floor(estimatedTimeRemaining / 60)}:{(estimatedTimeRemaining % 60).toString().padStart(2, '0')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {status === 'complete' && (
                  <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Duration validation error */}
      {durationError && (
        <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {durationError}
        </div>
      )}

      {/* Generate Button or Get Credits CTA */}
      {!hasCredits && allFilesReady && durationValid === true && !showLinkCard && getCreditsHref ? (
        <Link
          href={getCreditsHref}
          className="w-full mt-6 px-6 py-4 rounded-xl font-semibold text-white bg-slate-700 hover:bg-slate-600 transition-all block text-center"
        >
          Need 3+ credits — Re-up on credits
        </Link>
      ) : (
        <button
          disabled={!canGenerate || isGenerating}
          onClick={canGenerate && !isGenerating ? onGenerate : undefined}
          className={`
            w-full mt-6 px-6 py-4 rounded-xl font-semibold text-white transition-all
            ${canGenerate && !isGenerating
              ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 tap-effect animate-glow-pulse'
              : 'bg-slate-700 cursor-not-allowed opacity-50'
            }
          `}
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generating...
            </span>
          ) : canGenerate ? (
            generationSeconds != null ? `🚀 Generate Music Video (${generationSeconds}s)` : '🚀 Generate Music Video'
          ) : !hasCredits && allFilesReady && durationValid === true && showLinkCard ? (
            'Add a payment method above to get 3 free credits'
          ) : allFilesReady && durationValid === false ? (
            durationError || 'Fix duration (3–9s video, audio must match if provided)'
          ) : allFilesReady && hasVideo && durationValid !== true ? (
            'Checking durations...'
          ) : (
            '📤 Upload Video & Image to Start (Audio Optional)'
          )}
        </button>
      )}

      {!allFilesReady && (
        <p className="text-xs text-slate-400 text-center mt-2">
          Need: {!hasVideo && 'Video'} {!hasImage && 'Image'} {hasVideo && hasImage && !hasAudio && '(Audio optional)'}
        </p>
      )}
      {allFilesReady && durationValid === true && generationSeconds != null && (
        <p className="text-xs text-slate-400 text-center mt-2">
          {generationSeconds}s (3–9s, same length) · 1 credit per second
        </p>
      )}
    </GlassCard>
  );
}
