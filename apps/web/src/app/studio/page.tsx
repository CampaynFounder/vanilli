'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { GlassCard } from '@/components/ui/GlassCard';
import { MediaUpload } from '@/components/studio/MediaUpload';
import { GenerationFlow } from '@/components/studio/GenerationFlow';
import { GenerationPreview } from '@/components/studio/GenerationPreview';
import { AppBackground } from '@/components/AppBackground';

const BUCKET = 'vannilli';
const INPUTS = 'inputs';
const OUTPUTS = 'outputs';

function StudioPage() {
  const router = useRouter();
  const { signOut, user, refreshUser } = useAuth();

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

  // Optional Kling prompt: context/environment (motion comes from video). Max 100; Kling does not publish a motion-control limit; 100 is a safe UI cap.
  const [prompt, setPrompt] = useState('');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<'idle' | 'preparing' | 'lipsync' | 'syncing' | 'watermark' | 'finalizing' | 'complete'>('idle');
  const [generationStatus, setGenerationStatus] = useState<'pending' | 'processing' | 'completed' | 'failed'>('pending');
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Client-side: 3–9s, same length, length must not exceed credits. 1 credit = 1 second. Use whole seconds only (floor).
  const DURATION_MATCH_TOLERANCE = 0.5;
  const creditsRemaining = user?.creditsRemaining ?? 0;
  useEffect(() => {
    if (videoDuration == null || audioDuration == null || videoDuration <= 0 || audioDuration <= 0) {
      setDurationValidation(null);
      return;
    }
    if (creditsRemaining < 3) {
      setDurationValidation({ valid: false, error: 'Re-up on credits to generate (minimum 3 credits for 3–9s videos).' });
      return;
    }
    const videoWhole = Math.floor(videoDuration);
    const audioWhole = Math.floor(audioDuration);
    if (videoWhole < 3 || audioWhole < 3) {
      setDurationValidation({ valid: false, error: 'Video and audio must be at least 3 seconds' });
      return;
    }
    if (videoWhole > 9 || audioWhole > 9) {
      setDurationValidation({ valid: false, error: 'Video and audio must be at most 9 seconds' });
      return;
    }
    const diff = Math.abs(videoDuration - audioDuration);
    if (diff > DURATION_MATCH_TOLERANCE) {
      setDurationValidation({
        valid: false,
        error: `Video and audio must be the same length (video: ${videoDuration.toFixed(1)}s, audio: ${audioDuration.toFixed(1)}s)`,
      });
      return;
    }
    // Billable seconds: whole seconds only (floor). 3.0–3.99 → 3, 4.0–4.99 → 4.
    const secs = (videoDuration + audioDuration) / 2;
    const genSecs = Math.max(3, Math.min(9, Math.floor(secs)));
    if (genSecs > creditsRemaining) {
      setDurationValidation({
        valid: false,
        error: `Video length (${genSecs}s) exceeds your credits (${creditsRemaining}). Re-up on credits or use ${creditsRemaining}s or shorter.`,
      });
      return;
    }
    setDurationValidation({ valid: true, generationSeconds: genSecs });
  }, [videoDuration, audioDuration, creditsRemaining]);

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
    const uid = user?.id;
    if (!uid || !trackingVideo || !targetImage || !audioTrack) return;
    if (durationValidation?.valid !== true) return; // gate: video ≤ credits, 3s min, same length
    const genSecs = durationValidation.generationSeconds;
    const modalUrl = process.env.NEXT_PUBLIC_MODAL_PROCESS_VIDEO_URL;
    if (!modalUrl) {
      setGenerationError('Processing endpoint not configured. Set NEXT_PUBLIC_MODAL_PROCESS_VIDEO_URL.');
      return;
    }

    setGenerationError(null);
    setIsGenerating(true);
    setCurrentStep('preparing');

    try {

      // 1) Create project (placeholders for r2_paths; real files go to inputs/{genId}/)
      const { data: proj, error: pe } = await supabase
        .from('projects')
        .insert({
          user_id: uid,
          track_name: 'Studio',
          bpm: 120,
          bars: 4,
          duration_seconds: genSecs,
          target_image_r2_path: 'inputs/pl/target.jpg',
          driver_video_r2_path: 'inputs/pl/tracking.mp4',
          status: 'processing',
        })
        .select('id')
        .single();
      if (pe || !proj?.id) throw new Error(pe?.message || 'Failed to create project');

      // 2) Create generation (cost_credits = seconds; trigger deducts on completion)
      const { data: gen, error: ge } = await supabase
        .from('generations')
        .insert({ project_id: proj.id, cost_credits: genSecs, status: 'pending' })
        .select('id')
        .single();
      if (ge || !gen?.id) throw new Error(ge?.message || 'Failed to create generation');
      const gid = gen.id;

      // 3) Upload to Storage: inputs/{gid}/tracking.mp4, target.jpg, audio.mp3
      const base = `${INPUTS}/${gid}`;
      const up = async (path: string, file: File) => {
        const { error: ue } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
        if (ue) throw new Error(`Upload ${path} failed: ${ue.message}`);
      };
      await up(`${base}/tracking.mp4`, trackingVideo);
      await up(`${base}/target.jpg`, targetImage);
      await up(`${base}/audio.mp3`, audioTrack);

      setCurrentStep('lipsync');
      setGenerationStatus('processing');
      setGenerationProgress(10);
      setGenerationId(gid);

      // 4) Signed URLs for Modal to download (1h)
      const { data: t } = await supabase.storage.from(BUCKET).createSignedUrl(`${base}/tracking.mp4`, 3600);
      const { data: i } = await supabase.storage.from(BUCKET).createSignedUrl(`${base}/target.jpg`, 3600);
      const { data: a } = await supabase.storage.from(BUCKET).createSignedUrl(`${base}/audio.mp3`, 3600);
      if (!t?.signedUrl || !i?.signedUrl || !a?.signedUrl) throw new Error('Could not create signed URLs');

      // 5) Call Modal
      const res = await fetch(modalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracking_video_url: t.signedUrl,
          target_image_url: i.signedUrl,
          audio_track_url: a.signedUrl,
          generation_id: gid,
          generation_seconds: genSecs,
          is_trial: user?.tier === 'free',
          prompt: (prompt || '').slice(0, 100),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || `Processing failed: ${res.status}`);

      // 6) Poll generations
      const poll = async (): Promise<void> => {
        const { data: row } = await supabase.from('generations').select('status, error_message, final_video_r2_path').eq('id', gid).single();
        if (row?.status === 'completed') {
          setCurrentStep('complete');
          setGenerationProgress(100);
          setGenerationStatus('completed');
          setIsGenerating(false);
          refreshUser(); // refresh credits after trigger deducts
          return;
        }
        if (row?.status === 'failed') {
          setGenerationStatus('failed');
          setGenerationError(row?.error_message || 'Generation failed');
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
    <div className="min-h-screen relative">
      <AppBackground />
      <div className="relative z-10">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/90 border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <Logo width={120} height={40} className="h-12 md:h-14" />
              <div className="flex items-center gap-4 md:gap-6">
                <Link href="/profile" className="opacity-60 hover:opacity-100 transition-opacity" aria-label="Profile">
                  <img src="/icons/nav/profile.png" alt="" className="h-10 md:h-11 w-auto object-contain" />
                </Link>
                <Link href="/studio" className="opacity-100 transition-opacity" aria-label="Studio">
                  <img src="/icons/nav/studio.png" alt="" className="h-10 md:h-11 w-auto object-contain" />
                </Link>
                <Link href="/history" className="opacity-60 hover:opacity-100 transition-opacity" aria-label="History">
                  <img src="/icons/nav/history.png" alt="" className="h-10 md:h-11 w-auto object-contain" />
                </Link>
                <Link href="/pricing" className="opacity-60 hover:opacity-100 transition-opacity" aria-label="Pricing">
                  <img src="/icons/nav/pricing.png" alt="" className="h-10 md:h-11 w-auto object-contain" />
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
              label="1. Vannilli Video"
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
              label="2. Vannilli Image"
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
              label="3. Vannilli Track"
              description="Your music track (final audio for the video)"
              accept="audio/wav,audio/wave"
              onFileSelect={handleAudioSelect}
              onDuration={setAudioDuration}
              preview={audioPreview}
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              }
            />

            {/* Scene prompt (optional) – passed to Kling motion-control. Describe context/environment, not motion. */}
            <GlassCard>
              <label htmlFor="studio-prompt" className="block text-sm font-medium text-slate-300 mb-2">
                4. Scene prompt <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <input
                id="studio-prompt"
                type="text"
                maxLength={100}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. On a stage with soft lighting, urban background"
                className="w-full px-4 py-3 rounded-lg bg-slate-800/50 border border-slate-700 text-white placeholder-slate-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors"
                aria-describedby="studio-prompt-hint"
              />
              <p id="studio-prompt-hint" className="mt-1.5 text-xs text-slate-500">
                Context and environment for the scene. Motion comes from your video. {prompt.length}/100
              </p>
            </GlassCard>
          </div>

          {/* Right Column - Generation Flow */}
          <div className="space-y-6">
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
              hasCredits={(user?.creditsRemaining ?? 0) >= 3}
              showLinkCard={false}
              getCreditsHref="/pricing"
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
                generationId
                  ? async () => {
                      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(`${OUTPUTS}/${generationId}/final.mp4`, 3600);
                      if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                    }
                  : undefined
              }
              onCreateAnother={
                user?.id
                  ? async () => {
                      const { data: rows } = await supabase.from('users').select('credits_remaining').eq('id', user.id);
                      const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
                      if ((row?.credits_remaining ?? 0) < 3) {
                        router.replace('/pricing');
                        return;
                      }
                      [videoPreview, imagePreview, audioPreview].forEach((u) => u && URL.revokeObjectURL(u));
                      setTrackingVideo(null); setTargetImage(null); setAudioTrack(null);
                      setPrompt('');
                      setVideoDuration(null); setAudioDuration(null); setDurationValidation(null);
                      setVideoPreview(null); setImagePreview(null); setAudioPreview(null);
                      setIsGenerating(false); setGenerationProgress(0); setCurrentStep('idle');
                      setGenerationStatus('pending'); setGenerationId(null); setGenerationError(null);
                      refreshUser();
                    }
                  : undefined
              }
            />
          </GlassCard>
        )}
      </div>
      </div>
    </div>
  );
}

export default withAuth(StudioPage);
