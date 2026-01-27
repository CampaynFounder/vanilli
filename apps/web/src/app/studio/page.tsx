'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { sanitizeForUser } from '@/lib/utils';
import { Logo } from '@/components/Logo';
import { GlassCard } from '@/components/ui/GlassCard';
import { MediaUpload } from '@/components/studio/MediaUpload';
import { MultiImageUpload } from '@/components/studio/MultiImageUpload';
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
  const [targetImages, setTargetImages] = useState<File[]>([]);
  const [audioTrack, setAudioTrack] = useState<File | null>(null);

  // Durations (seconds) from video/audio elements
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [durationValidation, setDurationValidation] = useState<null | { valid: true; generationSeconds: number } | { valid: false; error: string }>(null);

  // Preview URLs
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  
  // Get max images based on tier
  const maxImages = user?.tier === 'demo' || user?.tier === 'industry' ? 9 : 1;
  const hasImage = targetImages.length > 0;

  // Optional scene prompt: context/environment (motion comes from video). Max 100 chars.
  const [prompt, setPrompt] = useState('');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<'idle' | 'preparing' | 'lipsync' | 'syncing' | 'watermark' | 'finalizing' | 'complete'>('idle');
  const [generationStatus, setGenerationStatus] = useState<'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'>('pending');
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
  
  // Real-time countdown timer for estimated time
  useEffect(() => {
    if (estimatedTimeRemaining != null && estimatedTimeRemaining > 0 && isGenerating) {
      const interval = setInterval(() => {
        setEstimatedTimeRemaining((prev) => {
          if (prev == null || prev <= 0) return 0;
          return prev - 1;
        });
      }, 1000); // Update every second
      
      return () => clearInterval(interval);
    }
  }, [estimatedTimeRemaining, isGenerating]);
  
  // Cancel generation handler
  const handleCancelGeneration = async () => {
    if (!generationId || !user?.id) return;
    
    try {
      const { error } = await supabase.rpc('cancel_generation', {
        generation_uuid: generationId,
        user_uuid: user.id,
      });
      
      if (error) {
        console.error('[studio] Cancel error:', error);
        setGenerationError('Failed to cancel generation. Please try again.');
        return;
      }
      
      // Update local state
      setGenerationStatus('cancelled');
      setIsGenerating(false);
      setGenerationProgress(0);
      setCurrentStep('idle');
      setEstimatedTimeRemaining(null);
      refreshUser(); // Refresh credits
    } catch (e) {
      console.error('[studio] Cancel exception:', e);
      setGenerationError('Failed to cancel generation. Please try again.');
    }
  };

  // Client-side: Tier-based duration limits. Audio optional. If audio provided, must match video length. 1 credit = 1 second.
  const DURATION_MATCH_TOLERANCE = 0.5;
  const creditsRemaining = user?.creditsRemaining ?? 0;
  const userTier = user?.tier || 'free';
  
  // Get max duration based on tier and credits
  // For DEMO and Industry: allow up to credit limit (capped at tier max)
  // For others: fixed 9 seconds
  const getMaxDuration = () => {
    if (userTier === 'demo') {
      // DEMO tier: up to credits available, capped at 20 seconds
      return Math.min(creditsRemaining, 20);
    }
    if (userTier === 'industry') {
      // Industry tier: up to credits available, capped at 90 seconds
      return Math.min(creditsRemaining, 90);
    }
    return 9; // open_mic, artist, label - fixed 9 seconds
  };
  
  // Handle checkout success - refresh user data to get updated credits
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      // Remove query param from URL
      window.history.replaceState({}, '', '/studio');
      // Refresh user data to get updated credits/tier
      refreshUser();
    }
  }, [refreshUser]);

  useEffect(() => {
    if (videoDuration == null || videoDuration <= 0) {
      setDurationValidation(null);
      return;
    }
    const maxDuration = getMaxDuration();
    const minDuration = 3;
    
    if (creditsRemaining < minDuration) {
      setDurationValidation({ valid: false, error: `Re-up on credits to generate (minimum ${minDuration} credits).` });
      return;
    }
    const videoWhole = Math.floor(videoDuration);
    if (videoWhole < minDuration) {
      setDurationValidation({ valid: false, error: `Video must be at least ${minDuration} seconds` });
      return;
    }
    if (videoWhole > maxDuration) {
      setDurationValidation({ valid: false, error: `Video must be at most ${maxDuration} seconds for ${userTier} tier` });
      return;
    }
    // If audio is provided, validate it
    if (audioTrack && audioDuration != null && audioDuration > 0) {
      const audioWhole = Math.floor(audioDuration);
      if (audioWhole < minDuration) {
        setDurationValidation({ valid: false, error: `Audio must be at least ${minDuration} seconds` });
        return;
      }
      // For DEMO and Industry tiers: audio can be different length (uses global alignment + tempo chunking)
      // For lower tiers: audio must match video length
      if (userTier !== 'demo' && userTier !== 'industry') {
        if (audioWhole > maxDuration) {
          setDurationValidation({ valid: false, error: `Audio must be at most ${maxDuration} seconds` });
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
      }
      // For DEMO/Industry: audio can be longer or shorter, system will align and slice appropriately
    }
    // Billable seconds: whole seconds only (floor). 3.0–3.99 → 3, 4.0–4.99 → 4.
    const genSecs = Math.max(minDuration, Math.min(maxDuration, videoWhole));
    if (genSecs > creditsRemaining) {
      setDurationValidation({
        valid: false,
        error: `Video length (${genSecs}s) exceeds your credits (${creditsRemaining}). Re-up on credits or use ${creditsRemaining}s or shorter.`,
      });
      return;
    }
    setDurationValidation({ valid: true, generationSeconds: genSecs });
  }, [videoDuration, audioDuration, audioTrack, creditsRemaining, userTier]);

  // Handle file uploads
  const handleVideoSelect = (file: File) => {
    setTrackingVideo(file);
    setVideoPreview(URL.createObjectURL(file));
    setVideoDuration(null);
  };

  const handleImagesSelect = (files: File[]) => {
    setTargetImages(files);
    setImagePreviews(files.map(f => URL.createObjectURL(f)));
  };

  const handleAudioSelect = (file: File) => {
    setAudioTrack(file);
    setAudioPreview(URL.createObjectURL(file));
    setAudioDuration(null);
  };

  const handleGenerate = async () => {
    const uid = user?.id;
    if (!uid || !trackingVideo || targetImages.length === 0) return;
    if (durationValidation?.valid !== true) return; // gate: video ≤ credits, 3s min, audio matches if provided
    const genSecs = durationValidation.generationSeconds;
    const userTier = user?.tier || 'free';
    
    // For DEMO/Industry tiers, use video_jobs queue. For others, use legacy flow.
    const useQueueSystem = userTier === 'demo' || userTier === 'industry';

    setGenerationError(null);
    setIsGenerating(true);
    setCurrentStep('preparing');
    setGenerationProgress(5);

    try {
      const base = `${INPUTS}/${uid}`;
      const up = async (path: string, file: File) => {
        const { error: ue } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
        if (ue) throw new Error(`Upload ${path} failed: ${ue.message}`);
      };

      // Helper to generate thumbnail from image
      const generateImageThumbnail = async (file: File): Promise<Blob | null> => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxSize = 200;
            let width = img.width;
            let height = img.height;
            if (width > height) {
              if (width > maxSize) {
                height = (height * maxSize) / width;
                width = maxSize;
              }
            } else {
              if (height > maxSize) {
                width = (width * maxSize) / height;
                height = maxSize;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              canvas.toBlob(resolve, 'image/jpeg', 0.8);
            } else {
              resolve(null);
            }
          };
          img.onerror = () => resolve(null);
          img.src = URL.createObjectURL(file);
        });
      };
      
      // Helper to generate thumbnail from video
      const generateVideoThumbnail = async (file: File): Promise<Blob | null> => {
        return new Promise((resolve) => {
          const video = document.createElement('video');
          video.preload = 'metadata';
          video.onloadedmetadata = () => {
            video.currentTime = 0.1; // Seek to first frame
          };
          video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0);
              canvas.toBlob(resolve, 'image/jpeg', 0.8);
            } else {
              resolve(null);
            }
          };
          video.onerror = () => resolve(null);
          video.src = URL.createObjectURL(file);
        });
      };
      
      // Upload files and generate thumbnails
      await up(`${base}/tracking.mp4`, trackingVideo);
      const videoThumbnail = await generateVideoThumbnail(trackingVideo);
      let videoThumbnailPath: string | null = null;
      if (videoThumbnail) {
        const thumbPath = `${base}/tracking_thumb.jpg`;
        await up(thumbPath, new File([videoThumbnail], 'thumb.jpg', { type: 'image/jpeg' }));
        videoThumbnailPath = thumbPath;
      }
      
      const imageUrls: string[] = [];
      let primaryImageThumbnailPath: string | null = null;
      for (let i = 0; i < targetImages.length; i++) {
        const ext = targetImages[i].name.split('.').pop() || 'jpg';
        const path = `${base}/target_${i}.${ext}`;
        await up(path, targetImages[i]);
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
        if (signed?.signedUrl) imageUrls.push(signed.signedUrl);
        
        // Generate thumbnail for first image (primary thumbnail)
        if (i === 0) {
          const imgThumbnail = await generateImageThumbnail(targetImages[i]);
          if (imgThumbnail) {
            const thumbPath = `${base}/target_${i}_thumb.jpg`;
            await up(thumbPath, new File([imgThumbnail], 'thumb.jpg', { type: 'image/jpeg' }));
            primaryImageThumbnailPath = thumbPath;
          }
        }
      }
      
      let audioSignedUrl: string | null = null;
      if (audioTrack) {
        const audioExt = audioTrack.name.split('.').pop() || 'mp3';
        await up(`${base}/audio.${audioExt}`, audioTrack);
        const { data: a } = await supabase.storage.from(BUCKET).createSignedUrl(`${base}/audio.${audioExt}`, 3600);
        if (a?.signedUrl) audioSignedUrl = a.signedUrl;
      }

      const { data: t } = await supabase.storage.from(BUCKET).createSignedUrl(`${base}/tracking.mp4`, 3600);
      if (!t?.signedUrl || imageUrls.length === 0) throw new Error('Could not create signed URLs');

      if (useQueueSystem) {
        // Use video_jobs queue system for DEMO/Industry
        // Use primary image thumbnail as generation thumbnail (or video thumbnail as fallback)
        const thumbnailPath = primaryImageThumbnailPath || videoThumbnailPath;
        
        // Create generation record IMMEDIATELY so it's visible in history
        const { data: gen, error: ge } = await supabase
          .from('generations')
          .insert({ 
            cost_credits: genSecs, 
            status: 'pending',
            thumbnail_r2_path: thumbnailPath, // Store thumbnail path
            progress_percentage: 0, // Initial progress
            current_stage: 'pending', // Initial stage
          })
          .select('id, cost_credits, status, thumbnail_r2_path, created_at')
          .single();
        if (ge || !gen?.id) {
          console.error('[studio] Failed to create generation:', ge);
          throw new Error(ge?.message || 'Failed to create generation');
        }
        
        console.log('[studio] Generation created:', gen.id, 'credits:', genSecs);
        
        const { data: job, error: je } = await supabase
          .from('video_jobs')
          .insert({
            user_id: uid,
            generation_id: gen.id,
            tier: userTier,
            is_first_time: false, // TODO: detect first time
            status: 'PENDING_ANALYSIS',
            user_video_url: t.signedUrl,
            master_audio_url: audioSignedUrl || t.signedUrl, // Use video audio if no separate audio
            target_images: imageUrls,
            prompt: (prompt || '').slice(0, 100) || null,
          })
          .select('id')
          .single();
        
        if (je || !job?.id) throw new Error(je?.message || 'Failed to create video job');
        
        setGenerationId(gen.id);
        setCurrentStep('lipsync');
        setGenerationStatus('processing');
        setGenerationProgress(5); // Initial progress
        
        // Calculate estimated time based on video duration
        // Rough estimate: 60-90 seconds per chunk, plus analysis time
        if (videoDuration && videoDuration > 0) {
          const estimatedSecondsPerChunk = 75;
          // For DEMO/Industry tiers, chunks are typically ~9 seconds (tempo-based)
          // For lower tiers, it's a single 9-second chunk
          const defaultChunkDuration = 9;
          const numChunks = Math.ceil(videoDuration / defaultChunkDuration);
          const estimatedTotalSeconds = 30 + (numChunks * estimatedSecondsPerChunk); // 30s for analysis
          setEstimatedTimeRemaining(estimatedTotalSeconds);
        } else {
          // Fallback estimate if video duration is not available
          setEstimatedTimeRemaining(90); // Default 90 seconds
        }
        
        // Poll for progress updates (async, non-blocking)
        const poll = async (): Promise<void> => {
          try {
            const { data: row } = await supabase
              .from('generations')
              .select('status, error_message, final_video_r2_path, progress_percentage, current_stage, estimated_completion_at')
              .eq('id', gen.id)
              .single();
            
            if (!row) {
              setTimeout(poll, 3000);
              return;
            }
            
            // Update progress from database (always update, even if 0)
            if (row.progress_percentage !== null && row.progress_percentage !== undefined) {
              setGenerationProgress(row.progress_percentage);
            } else if (row.status === 'processing') {
              // If status is processing but no progress, set minimum visible progress
              setGenerationProgress((prev) => Math.max(prev, 5));
            }
            
            // Update current stage
            if (row.current_stage) {
              const stageMap: Record<string, typeof currentStep> = {
                'analyzing': 'preparing',
                'processing_chunks': 'lipsync',
                'stitching': 'syncing',
                'finalizing': 'finalizing',
                'completed': 'complete',
              };
              if (stageMap[row.current_stage]) {
                setCurrentStep(stageMap[row.current_stage]);
              }
            }
            
            // Calculate estimated time remaining from database
            if (row.estimated_completion_at) {
              const estimated = new Date(row.estimated_completion_at).getTime();
              const now = Date.now();
              const remaining = Math.max(0, Math.floor((estimated - now) / 1000));
              setEstimatedTimeRemaining(remaining);
            } else if (row.status === 'processing' && estimatedTimeRemaining == null) {
              // If processing but no estimate, use fallback
              setEstimatedTimeRemaining(90);
            }
            
            if (row.status === 'completed') {
              setCurrentStep('complete');
              setGenerationProgress(100);
              setGenerationStatus('completed');
              setIsGenerating(false);
              setEstimatedTimeRemaining(0);
              if (row.final_video_r2_path) {
                const { data: urlData } = await supabase.storage.from(BUCKET).createSignedUrl(row.final_video_r2_path, 3600);
                if (urlData?.signedUrl) setVideoUrl(urlData.signedUrl);
              }
              refreshUser();
              return;
            }
            
            if (row.status === 'failed') {
              setGenerationStatus('failed');
              setGenerationError(row?.error_message ? sanitizeForUser(row.error_message) : 'Generation failed');
              setIsGenerating(false);
              setEstimatedTimeRemaining(null);
              return;
            }
            
            if (row.status === 'cancelled') {
              setGenerationStatus('cancelled');
              setIsGenerating(false);
              setEstimatedTimeRemaining(null);
              refreshUser(); // Refresh credits
              return;
            }
            
            // Continue polling
            setTimeout(poll, 3000);
          } catch (e) {
            console.error('[studio] Poll error:', e);
            setTimeout(poll, 5000); // Retry with longer delay on error
          }
        };
        
        // Start polling immediately (async, non-blocking)
        setTimeout(poll, 2000);
      } else {
        // Legacy flow for lower tiers
        const { data: proj, error: pe } = await supabase
          .from('projects')
          .insert({
            user_id: uid,
            track_name: 'Studio',
            bpm: 120,
            bars: 4,
            duration_seconds: genSecs,
            target_image_r2_path: `${base}/target_0.jpg`,
            driver_video_r2_path: `${base}/tracking.mp4`,
            prompt: (prompt || '').slice(0, 100) || null,
            status: 'processing',
          })
          .select('id')
          .single();
        if (pe || !proj?.id) throw new Error(pe?.message || 'Failed to create project');

        // Generate thumbnail for legacy flow too
        const thumbnailPath = primaryImageThumbnailPath || videoThumbnailPath;
        
        // Create generation record IMMEDIATELY so it's visible in history
        const { data: gen, error: ge } = await supabase
          .from('generations')
          .insert({ 
            project_id: proj.id, 
            cost_credits: genSecs, 
            status: 'pending',
            thumbnail_r2_path: thumbnailPath, // Store thumbnail path
            progress_percentage: 0, // Initial progress
            current_stage: 'pending', // Initial stage
          })
          .select('id, cost_credits, status, thumbnail_r2_path, created_at')
          .single();
        if (ge || !gen?.id) {
          console.error('[studio] Failed to create generation:', ge);
          throw new Error(ge?.message || 'Failed to create generation');
        }
        
        console.log('[studio] Generation created:', gen.id, 'credits:', genSecs);
        const gid = gen.id;

        await supabase
          .from('projects')
          .update({
            driver_video_r2_path: `${base}/tracking.mp4`,
            target_image_r2_path: `${base}/target_0.jpg`,
            audio_r2_path: audioTrack ? `${base}/audio.${audioTrack.name.split('.').pop() || 'mp3'}` : null,
            prompt: (prompt || '').slice(0, 100) || null,
          })
          .eq('id', proj.id);

        setCurrentStep('lipsync');
        setGenerationStatus('processing');
        setGenerationProgress(10);
        setGenerationId(gid);

        const modalUrl = process.env.NEXT_PUBLIC_MODAL_PROCESS_VIDEO_URL;
        if (!modalUrl) throw new Error('Processing endpoint not configured');

        // 5) Call Modal (legacy flow)
        const res = await fetch(modalUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tracking_video_url: t.signedUrl,
            target_image_url: imageUrls[0],
            audio_track_url: audioSignedUrl,
            generation_id: gid,
            generation_seconds: genSecs,
            is_trial: user?.tier === 'free',
            prompt: (prompt || '').slice(0, 100),
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.ok) throw new Error(j?.error || `Processing failed: ${res.status}`);

        // 6) Poll generations (legacy flow) - async, non-blocking
        const poll = async (): Promise<void> => {
          try {
            const { data: row } = await supabase
              .from('generations')
              .select('status, error_message, final_video_r2_path, progress_percentage, current_stage, estimated_completion_at')
              .eq('id', gid)
              .single();
            
            if (!row) {
              setTimeout(poll, 3000);
              return;
            }
            
            // Update progress from database
            if (row.progress_percentage !== null && row.progress_percentage !== undefined) {
              setGenerationProgress(row.progress_percentage);
            } else {
              // Fallback: increment progress if not in database
              setGenerationProgress((p) => Math.min(p + 5, 90));
            }
            
            // Update current stage
            if (row.current_stage) {
              const stageMap: Record<string, typeof currentStep> = {
                'analyzing': 'preparing',
                'processing_chunks': 'lipsync',
                'stitching': 'syncing',
                'finalizing': 'finalizing',
                'completed': 'complete',
              };
              if (stageMap[row.current_stage]) {
                setCurrentStep(stageMap[row.current_stage]);
              }
            }
            
            // Calculate estimated time remaining
            if (row.estimated_completion_at) {
              const estimated = new Date(row.estimated_completion_at).getTime();
              const now = Date.now();
              const remaining = Math.max(0, Math.floor((estimated - now) / 1000));
              setEstimatedTimeRemaining(remaining);
            }
            
            if (row.status === 'completed') {
              setCurrentStep('complete');
              setGenerationProgress(100);
              setGenerationStatus('completed');
              setIsGenerating(false);
              setEstimatedTimeRemaining(0);
              try {
                const { data: urlData } = await supabase.storage.from(BUCKET).createSignedUrl(`${OUTPUTS}/${gid}/final.mp4`, 3600);
                if (urlData?.signedUrl) setVideoUrl(urlData.signedUrl);
              } catch (e) {
                console.error('[vannilli] Error creating video URL:', e);
              }
              refreshUser();
              return;
            }
            
            if (row.status === 'failed') {
              setGenerationStatus('failed');
              setGenerationError(row?.error_message ? sanitizeForUser(row.error_message) : 'Generation failed');
              setIsGenerating(false);
              setEstimatedTimeRemaining(null);
              return;
            }
            
            if (row.status === 'cancelled') {
              setGenerationStatus('cancelled');
              setIsGenerating(false);
              setEstimatedTimeRemaining(null);
              refreshUser(); // Refresh credits
              return;
            }
            
            setTimeout(poll, 3000);
          } catch (e) {
            console.error('[studio] Poll error:', e);
            setTimeout(poll, 5000); // Retry with longer delay on error
          }
        };
        setTimeout(poll, 2000);
      }
    } catch (e) {
      setGenerationStatus('failed');
      setGenerationError(sanitizeForUser(e instanceof Error ? e.message : 'Generation failed'));
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen relative">
      <AppBackground />
      <div className="relative z-10">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/90 border-b border-slate-800/50 h-12 sm:h-14 md:h-16 overflow-x-hidden">
        <div className="w-full mx-auto px-1 sm:px-2 md:px-4 lg:px-6 h-full overflow-x-hidden">
          <div className="flex items-center justify-between h-full gap-0 sm:gap-0.5 md:gap-1 min-w-0">
            <div className="flex items-center gap-0.5 sm:gap-1 md:gap-1.5 lg:gap-2 h-full flex-shrink-0 min-w-0">
              <div className="flex items-center flex-shrink-0">
                <Logo width={120} height={40} className="h-6 sm:h-8 md:h-11 lg:h-14 w-auto object-contain" href="/profile" />
              </div>
              <div className="flex items-center gap-0 sm:gap-0.5 md:gap-1 lg:gap-1.5 flex-shrink-0">
                <Link href="/profile" className="opacity-60 hover:opacity-100 transition-opacity flex items-center flex-shrink-0" aria-label="Profile">
                  <img src="/icons/nav/profile.png" alt="" className="h-5 sm:h-7 md:h-9 lg:h-12 w-auto object-contain" />
                </Link>
                <Link href="/studio" className="opacity-100 transition-opacity flex items-center flex-shrink-0" aria-label="Studio">
                  <img src="/icons/nav/studio.png" alt="" className="h-5 sm:h-7 md:h-9 lg:h-12 w-auto object-contain" />
                </Link>
                <Link href="/history" className="opacity-60 hover:opacity-100 transition-opacity flex items-center flex-shrink-0" aria-label="History">
                  <img src="/icons/nav/history.png" alt="" className="h-5 sm:h-7 md:h-9 lg:h-12 w-auto object-contain" />
                </Link>
                <Link href="/pricing" className="opacity-60 hover:opacity-100 transition-opacity flex items-center flex-shrink-0" aria-label="Pricing">
                  <img src="/icons/nav/pricing.png" alt="" className="h-5 sm:h-7 md:h-9 lg:h-12 w-auto object-contain" />
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-0.5 sm:gap-1 md:gap-1.5 flex-shrink-0 min-w-0">
              <div className="px-0.5 sm:px-1 md:px-1.5 lg:px-2.5 py-0.5 sm:py-1 md:py-1.5 bg-purple-600/20 border border-purple-500/30 rounded sm:rounded-md md:rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-[8px] sm:text-[9px] md:text-xs font-semibold text-purple-300 text-center whitespace-nowrap">{creditsRemaining}</span>
              </div>
              <button
                onClick={async () => { await signOut(); router.push('/'); }}
                className="flex items-center gap-0 sm:gap-0.5 md:gap-1 lg:gap-1.5 px-0.5 sm:px-1 md:px-1.5 lg:px-2 py-0.5 sm:py-1 md:py-1.5 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded sm:rounded-md md:rounded-lg transition-colors flex-shrink-0"
                aria-label="Sign out"
              >
                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="hidden sm:inline text-[9px] md:text-xs lg:text-sm">Sign out</span>
              </button>
            </div>
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
              maxVideoSeconds={getMaxDuration()}
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              }
            />

            {/* Image Upload - Multi-image for DEMO/Industry, single for others */}
            {maxImages > 1 ? (
              <MultiImageUpload
                label="2. Vannilli Images"
                description={`Character faces to animate (${maxImages} max, will cycle through chunks)`}
                maxImages={maxImages}
                onImagesSelect={handleImagesSelect}
                previews={imagePreviews}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                }
              />
            ) : (
              <MediaUpload
                type="image"
                label="2. Vannilli Image"
                description="Character face to animate (your AI-generated image)"
                accept="image/jpeg,image/png,image/webp"
                onFileSelect={(file) => handleImagesSelect([file])}
                preview={imagePreviews[0] || null}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                }
              />
            )}

            {/* Audio Upload (Optional) */}
            <MediaUpload
              type="audio"
              label="3. Vannilli Track (Optional)"
              description="Your music track (final audio for the video). If not provided, video will use audio from tracking video."
              accept="audio/wav,audio/wave,audio/mp3,audio/mpeg,video/mp4"
              onFileSelect={handleAudioSelect}
              onDuration={setAudioDuration}
              preview={audioPreview}
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              }
            />

            {/* Scene prompt (optional) – passed to video generation. Describe context/environment, not motion. */}
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
              hasImage={hasImage}
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
              estimatedTimeRemaining={estimatedTimeRemaining}
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
              videoUrl={videoUrl}
              estimatedTimeRemaining={estimatedTimeRemaining}
              onCancelClick={generationStatus === 'processing' ? handleCancelGeneration : undefined}
              onDownloadClick={
                generationId
                  ? async () => {
                      try {
                        // Use existing videoUrl if available, otherwise create a new signed URL
                        let downloadUrl = videoUrl;
                        if (!downloadUrl) {
                          const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(`${OUTPUTS}/${generationId}/final.mp4`, 3600);
                          if (error) {
                            console.error('[vannilli] Download failed:', error);
                            setGenerationError(`Download failed: ${error.message || 'Could not create download link'}`);
                            return;
                          }
                          downloadUrl = data?.signedUrl || null;
                        }
                        if (downloadUrl) {
                          // Create a temporary anchor to trigger download
                          const a = document.createElement('a');
                          a.href = downloadUrl;
                          a.download = `vannilli-video-${generationId}.mp4`;
                          a.target = '_blank';
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        } else {
                          setGenerationError('Download link not available');
                        }
                      } catch (e) {
                        console.error('[vannilli] Download error:', e);
                        setGenerationError('Download failed. Please try again.');
                      }
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
                      [videoPreview, ...imagePreviews, audioPreview].forEach((u) => u && URL.revokeObjectURL(u));
                      setTrackingVideo(null); setTargetImages([]); setAudioTrack(null);
                      setPrompt('');
                      setVideoDuration(null); setAudioDuration(null); setDurationValidation(null);
                      setVideoPreview(null); setImagePreviews([]); setAudioPreview(null);
                      setIsGenerating(false); setGenerationProgress(0); setCurrentStep('idle');
                      setGenerationStatus('pending'); setGenerationId(null); setGenerationError(null); setVideoUrl(null);
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
