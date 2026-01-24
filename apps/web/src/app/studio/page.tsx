'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, withAuth } from '@/lib/auth';
import { Logo } from '@/components/Logo';
import { GlassCard } from '@/components/ui/GlassCard';
import { MediaUpload } from '@/components/studio/MediaUpload';
import { GenerationFlow } from '@/components/studio/GenerationFlow';
import { GenerationPreview } from '@/components/studio/GenerationPreview';

function StudioPage() {
  const router = useRouter();
  const { signOut, session } = useAuth();

  // Upload states
  const [trackingVideo, setTrackingVideo] = useState<File | null>(null);
  const [targetImage, setTargetImage] = useState<File | null>(null);
  const [audioTrack, setAudioTrack] = useState<File | null>(null);

  // Durations (seconds) from video/audio elements
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [durationValidation, setDurationValidation] = useState<null | { valid: true; generationSeconds: number } | { valid: false; error: string }>(null);

  // Preview URLs
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<'idle' | 'preparing' | 'lipsync' | 'syncing' | 'watermark' | 'finalizing' | 'complete'>('idle');
  const [generationStatus, setGenerationStatus] = useState<'pending' | 'processing' | 'completed' | 'failed'>('pending');
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Validate audio vs video durations when both are set
  useEffect(() => {
    if (videoDuration == null || audioDuration == null || videoDuration <= 0 || audioDuration <= 0) {
      setDurationValidation(null);
      return;
    }
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.vannilli.xaino.io';
    fetch(`${apiUrl}/api/validate-media-durations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoDurationSeconds: videoDuration, audioDurationSeconds: audioDuration }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.valid === true) {
          setDurationValidation({ valid: true, generationSeconds: data.generationSeconds });
        } else {
          setDurationValidation({ valid: false, error: data.error || 'Audio and video must be within 2s for lip-sync' });
        }
      })
      .catch(() => setDurationValidation({ valid: false, error: 'Could not validate durations' }));
  }, [videoDuration, audioDuration]);

  // Handle file uploads
  const handleVideoSelect = (file: File) => {
    setTrackingVideo(file);
    setVideoPreview(URL.createObjectURL(file));
    setVideoDuration(null);
  };

  const handleImageSelect = (file: File) => {
    setTargetImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleAudioSelect = (file: File) => {
    setAudioTrack(file);
    setAudioPreview(URL.createObjectURL(file));
    setAudioDuration(null);
  };

  const handleGenerate = async () => {
    if (!session?.access_token || !trackingVideo || !targetImage || !audioTrack) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.vannilli.xaino.io';
    const token = session.access_token;

    setGenerationError(null);
    setIsGenerating(true);
    setCurrentStep('preparing');

    try {
      // 1) Upload assets
      const upload = async (file: File, assetType: string) => {
        const res = await fetch(`${apiUrl}/api/upload/studio-asset`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'X-Asset-Type': assetType },
          body: file,
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error?.message || `Upload ${assetType} failed: ${res.status}`);
        }
        const data = await res.json();
        return data.key as string;
      };

      const [driverVideoKey, targetImageKey, audioKey] = await Promise.all([
        upload(trackingVideo, 'driverVideo'),
        upload(targetImage, 'targetImage'),
        upload(audioTrack, 'audio'),
      ]);

      setCurrentStep('lipsync');

      // 2) Start generation
      const startRes = await fetch(`${apiUrl}/api/start-generation-with-audio`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverVideoKey,
          targetImageKey,
          audioKey,
          videoDurationSeconds: videoDuration ?? 0,
          audioDurationSeconds: audioDuration ?? 0,
        }),
      });

      const startData = await startRes.json();
      if (!startRes.ok) {
        throw new Error(startData?.error?.message || `Start failed: ${startRes.status}`);
      }

      const taskId = startData.internalTaskId as string;
      setGenerationStatus('processing');
      setGenerationProgress(10);

      // 3) Poll status
      const poll = async (): Promise<void> => {
        const r = await fetch(`${apiUrl}/api/poll-status/${taskId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await r.json();
        if (d.status === 'completed') {
          setCurrentStep('complete');
          setGenerationProgress(100);
          setGenerationStatus('completed');
          setGenerationId(d.generationId ?? null);
          setIsGenerating(false);
          return;
        }
        if (d.status === 'failed') {
          setGenerationStatus('failed');
          setGenerationError(d.error || d.message || 'Generation failed');
          setIsGenerating(false);
          return;
        }
        setGenerationProgress((p) => Math.min(p + 15, 90));
        setTimeout(poll, 4000);
      };
      setTimeout(poll, 3000);
    } catch (e) {
      setGenerationStatus('failed');
      setGenerationError(e instanceof Error ? e.message : 'Generation failed');
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/90 border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <Logo width={120} height={40} className="h-10" />
              <div className="hidden md:flex gap-6">
                <Link href="/profile" className="text-slate-400 hover:text-white transition-colors">
                  Profile
                </Link>
                <Link href="/studio" className="text-white font-semibold">
                  Studio
                </Link>
                <Link href="/history" className="text-slate-400 hover:text-white transition-colors">
                  History
                </Link>
              </div>
            </div>
            <button
              onClick={async () => { await signOut(); router.push('/'); }}
              className="flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors text-sm"
              aria-label="Sign out"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold gradient-text-premium mb-2">Studio</h1>
          <p className="text-slate-400">Upload your files and generate professional music videos</p>
        </div>

        {/* Main Studio Area */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Left Column - Uploads */}
          <div className="space-y-6">
            {/* Video Upload */}
            <MediaUpload
              type="video"
              label="1. Tracking Video"
              description="Your performance recording (lip-sync movements)"
              accept="video/mp4,video/quicktime,video/webm"
              onFileSelect={handleVideoSelect}
              onDuration={setVideoDuration}
              preview={videoPreview}
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              }
            />

            {/* Image Upload */}
            <MediaUpload
              type="image"
              label="2. Target Image"
              description="Character face to animate (your AI-generated image)"
              accept="image/jpeg,image/png,image/webp"
              onFileSelect={handleImageSelect}
              preview={imagePreview}
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              }
            />

            {/* Audio Upload */}
            <MediaUpload
              type="audio"
              label="3. Audio Track"
              description="Your music track (final audio for the video)"
              accept="audio/mpeg,audio/wav,audio/mp4"
              onFileSelect={handleAudioSelect}
              onDuration={setAudioDuration}
              preview={audioPreview}
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              }
            />
          </div>

          {/* Right Column - Generation Flow */}
          <div>
            <GenerationFlow
              hasVideo={!!trackingVideo}
              hasImage={!!targetImage}
              hasAudio={!!audioTrack}
              isGenerating={isGenerating}
              progress={generationProgress}
              currentStep={currentStep}
              onGenerate={handleGenerate}
              durationError={durationValidation?.valid === false ? durationValidation.error : null}
              durationValid={durationValidation?.valid === true ? true : durationValidation?.valid === false ? false : undefined}
              generationSeconds={durationValidation?.valid === true ? durationValidation.generationSeconds : null}
            />

            {/* How It Works - VANNILLI branded */}
            <GlassCard className="mt-6">
              <h3 className="text-sm font-semibold text-white mb-3">How VANNILLI Works</h3>
              <div className="space-y-2 text-xs text-slate-400">
                <div className="flex gap-2">
                  <span className="text-purple-400">1.</span>
                  <span>VANNILLI processes your performance and target image</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-purple-400">2.</span>
                  <span>Our engine applies hyper-realistic lip-sync</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-purple-400">3.</span>
                  <span>Your audio track is mixed into the final video</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-purple-400">4.</span>
                  <span>Trial users receive a VANNILLI watermark</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-purple-400">5.</span>
                  <span>Your music video is ready to download</span>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>

        {/* Generation Result Preview */}
        {(isGenerating || generationStatus === 'completed' || generationStatus === 'failed') && (
          <GlassCard elevated>
            <h2 className="text-xl font-semibold text-white mb-4">Generation Preview</h2>
            {generationError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {generationError}
              </div>
            )}
            <GenerationPreview
              status={generationStatus}
              progress={generationProgress}
              onDownloadClick={
                generationId && session?.access_token
                  ? async () => {
                      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.vannilli.xaino.io';
                      const r = await fetch(`${apiUrl}/api/download/${generationId}`, {
                        headers: { Authorization: `Bearer ${session.access_token}` },
                      });
                      const d = await r.json();
                      if (d.downloadUrl) window.open(d.downloadUrl, '_blank');
                    }
                  : undefined
              }
            />
          </GlassCard>
        )}
      </div>
    </div>
  );
}

export default withAuth(StudioPage);
