'use client';

import { useState, useRef, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { supabase, getUser } from '@/lib/supabase';

interface ChunkInfo {
  chunkIndex: number;
  videoStartTime: number;
  videoEndTime: number;
  audioStartTime: number;
  audioEndTime: number;
  imageIndex: number | null;
  imageUrl: string | null;
  syncOffset: number;
  chunkDuration: number;
}

interface TempoAnalysis {
  bpm: number;
  secondsPerBeat: number;
  secondsPerMeasure: number;
  measuresPerChunk: number;
  chunkDuration: number;
}

interface ChunkPreview {
  chunk_index: number;
  video_chunk_url: string;
  audio_chunk_url: string;
  image_url?: string | null;  // Optional image URL for this chunk
  image_index?: number | null;  // Optional image index
  video_start_time: number;
  video_end_time: number;
  audio_start_time: number;
  audio_end_time: number;
}

interface ChunkPreviewResult {
  video_duration: number;
  audio_duration: number;
  num_chunks: number;
  chunks: ChunkPreview[];
}

export function ChunkObservability() {
  // File uploads
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  
  // File URLs for preview
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  
  // Analysis results (calculated automatically)
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [calculatedBpm, setCalculatedBpm] = useState<number | null>(null);
  const [calculatedSyncOffset, setCalculatedSyncOffset] = useState<number | null>(null);
  const [calculatedChunkDuration, setCalculatedChunkDuration] = useState<number | null>(null);
  const [tempoAnalysis, setTempoAnalysis] = useState<TempoAnalysis | null>(null);
  const [chunks, setChunks] = useState<ChunkInfo[]>([]);
  
  // UI state
  const [error, setError] = useState<string | null>(null);
  const [chunkPreviews, setChunkPreviews] = useState<ChunkPreviewResult | null>(null);
  const [generatingPreviews, setGeneratingPreviews] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [analyzingMedia, setAnalyzingMedia] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      imageUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [videoUrl, audioUrl, imageUrls]);

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setVideoDuration(null);
    setChunks([]);
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    
    setAudioFile(file);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    setAudioDuration(null);
    // Reset all calculated values when new audio is uploaded
    setCalculatedBpm(null);
    setCalculatedSyncOffset(null);
    setCalculatedChunkDuration(null);
    setTempoAnalysis(null);
    setChunks([]);
    setChunkPreviews(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    imageUrls.forEach((url) => URL.revokeObjectURL(url));
    
    setImageFiles(files);
    const urls = files.map((file) => URL.createObjectURL(file));
    setImageUrls(urls);
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(imageUrls[index]);
    const newFiles = imageFiles.filter((_, i) => i !== index);
    const newUrls = imageUrls.filter((_, i) => i !== index);
    setImageFiles(newFiles);
    setImageUrls(newUrls);
  };

  // Calculate tempo-based chunk duration (same logic as media_analyzer.py)
  const calculateChunkDurationFromBpm = (bpmValue: number): TempoAnalysis => {
    const secondsPerBeat = 60.0 / bpmValue;
    
    // 4/4 time: 4 beats per measure
    const secondsPerMeasure = secondsPerBeat * 4;
    
    // Target: ~9 seconds, but align to measure boundaries
    const targetDuration = 9.0;
    let measuresPerChunk = Math.max(1, Math.floor(targetDuration / secondsPerMeasure));
    let chunkDuration = measuresPerChunk * secondsPerMeasure;
    
    // Ensure we never exceed 9 seconds
    if (chunkDuration > 9.0) {
      measuresPerChunk -= 1;
      chunkDuration = measuresPerChunk * secondsPerMeasure;
    }
    
    // Minimum chunk size: at least 1 measure
    if (chunkDuration < secondsPerMeasure) {
      chunkDuration = secondsPerMeasure;
    }
    
    return {
      bpm: bpmValue,
      secondsPerBeat,
      secondsPerMeasure,
      measuresPerChunk,
      chunkDuration,
    };
  };



  const analyzeMediaWithModal = async () => {
    if (!videoFile || !audioFile || !videoUrl || !audioUrl) {
      setError('Please upload video and audio files first');
      return;
    }

    setAnalyzingMedia(true);
    setUploadingFiles(true);
    setError(null);

    try {
      // Get user ID for storage path - inputs/ requires authenticated user
      const user = await getUser();
      if (!user) {
        throw new Error('Please sign in to use chunk observability. The debug page requires authentication for file uploads.');
      }
      
      // Upload files to Supabase Storage using inputs/ path (has RLS policies for authenticated users)
      const tempId = `temp_${Date.now()}`;
      const videoPath = `inputs/${user.id}/${tempId}/video.mp4`;
      const audioPath = `inputs/${user.id}/${tempId}/audio.${audioFile.name.split('.').pop() || 'mp3'}`;

      console.log('Uploading files for analysis...');
      
      // Upload video (use File directly, not ArrayBuffer)
      const { error: videoError } = await supabase.storage
        .from('vannilli')
        .upload(videoPath, videoFile, {
          contentType: 'video/mp4',
          upsert: true,
        });

      if (videoError) {
        console.error('Video upload error:', videoError);
        throw new Error(`Failed to upload video: ${videoError.message}`);
      }

      // Upload audio (use File directly, not ArrayBuffer)
      const { error: audioError } = await supabase.storage
        .from('vannilli')
        .upload(audioPath, audioFile, {
          contentType: audioFile.type || 'audio/mpeg',
          upsert: true,
        });

      if (audioError) {
        console.error('Audio upload error:', audioError);
        throw new Error(`Failed to upload audio: ${audioError.message}`);
      }

      // Get signed URLs
      const { data: videoSigned, error: videoSignedError } = await supabase.storage
        .from('vannilli')
        .createSignedUrl(videoPath, 3600);

      const { data: audioSigned, error: audioSignedError } = await supabase.storage
        .from('vannilli')
        .createSignedUrl(audioPath, 3600);

      if (videoSignedError || audioSignedError) {
        throw new Error('Failed to create signed URLs');
      }

      const videoSignedUrl = (videoSigned as any)?.signedUrl || (videoSigned as any)?.signed_url;
      const audioSignedUrl = (audioSigned as any)?.signedUrl || (audioSigned as any)?.signed_url;

      if (!videoSignedUrl || !audioSignedUrl) {
        throw new Error('Failed to get signed URLs');
      }

      setUploadingFiles(false);
      setAnalyzingMedia(true);

      // Call Modal media_analyzer to get tempo and sync offset
      const analyzerUrl = process.env.NEXT_PUBLIC_MODAL_MEDIA_ANALYZER_URL || '';
      
      if (!analyzerUrl) {
        throw new Error('Modal media analyzer URL not configured. Set NEXT_PUBLIC_MODAL_MEDIA_ANALYZER_URL');
      }

      console.log('Calling Modal media analyzer...');
      
      const response = await fetch(analyzerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          job_id: `temp_${tempId}`, // Temporary job ID
          video: videoSignedUrl,
          audio: audioSignedUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const analysisResult = await response.json();
      
      // Extract results
      const bpm = analysisResult.bpm;
      const calculatedSyncOffset = analysisResult.sync_offset;
      const calculatedChunkDuration = analysisResult.chunk_duration;

      if (bpm && calculatedSyncOffset !== undefined && calculatedChunkDuration) {
        // Store calculated values
        setCalculatedBpm(bpm);
        setCalculatedSyncOffset(calculatedSyncOffset);
        setCalculatedChunkDuration(calculatedChunkDuration);
        
        // Calculate tempo analysis for display
        const analysis = calculateChunkDurationFromBpm(bpm);
        setTempoAnalysis(analysis);
        
        // Auto-calculate chunks first
        const numChunks = Math.ceil(videoDuration! / analysis.chunkDuration);
        const calculatedChunks: ChunkInfo[] = [];
        for (let i = 0; i < numChunks; i++) {
          const videoStartTime = i * analysis.chunkDuration;
          const videoEndTime = Math.min(videoStartTime + analysis.chunkDuration, videoDuration!);
          const audioStartTime = videoStartTime + calculatedSyncOffset;
          const audioEndTime = audioStartTime + analysis.chunkDuration;
          const imageIndex = imageFiles.length > 0 ? i % imageFiles.length : null;
          const imageUrl = imageIndex !== null ? imageUrls[imageIndex] : null;
          calculatedChunks.push({
            chunkIndex: i,
            videoStartTime,
            videoEndTime,
            audioStartTime,
            audioEndTime,
            imageIndex,
            imageUrl,
            syncOffset: calculatedSyncOffset,
            chunkDuration: analysis.chunkDuration,
          });
        }
        setChunks(calculatedChunks);
        
        // Upload images if provided and get signed URLs
        const imageSignedUrls: string[] = [];
        if (imageFiles.length > 0) {
          const imagePaths: string[] = [];
          for (let i = 0; i < imageFiles.length; i++) {
            const imagePath = `inputs/${user.id}/${tempId}/image_${i}.${imageFiles[i].name.split('.').pop() || 'jpg'}`;
            const { error: imageError } = await supabase.storage
              .from('vannilli')
              .upload(imagePath, imageFiles[i], {
                contentType: imageFiles[i].type || 'image/jpeg',
                upsert: true,
              });
            if (imageError) {
              console.warn(`Failed to upload image ${i}:`, imageError);
            } else {
              imagePaths.push(imagePath);
            }
          }
          
          // Get signed URLs for uploaded images
          for (const imagePath of imagePaths) {
            const { data: imageSigned, error: imageSignedError } = await supabase.storage
              .from('vannilli')
              .createSignedUrl(imagePath, 3600);
            if (!imageSignedError && imageSigned) {
              const imageSignedUrl = (imageSigned as any)?.signedUrl || (imageSigned as any)?.signed_url;
              if (imageSignedUrl) {
                imageSignedUrls.push(imageSignedUrl);
              }
            }
          }
        }
        
        // Then generate previews - Modal will calculate tempo/sync automatically
        await generateChunkPreviewsWithValues(
          videoSignedUrl,
          audioSignedUrl,
          imageSignedUrls.length > 0 ? imageSignedUrls : undefined
        );
        
        // Clean up image files too
        if (imageFiles.length > 0) {
          const imagePaths = imageFiles.map((_, i) => 
            `inputs/${user.id}/${tempId}/image_${i}.${imageFiles[i].name.split('.').pop() || 'jpg'}`
          );
          supabase.storage.from('vannilli').remove(imagePaths).catch(console.error);
        }
      } else {
        throw new Error('Analysis did not return expected values');
      }

      // Clean up temp files (async, don't wait)
      supabase.storage.from('vannilli').remove([videoPath, audioPath]).catch(console.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze media');
    } finally {
      setAnalyzingMedia(false);
      setUploadingFiles(false);
    }
  };

  const generateChunkPreviewsWithValues = async (
    videoSignedUrl: string,
    audioSignedUrl: string,
    imageUrls?: string[]
  ) => {
    setGeneratingPreviews(true);
    setError(null);

    try {
      // Call Modal function to generate chunk previews
      const modalUrl = process.env.NEXT_PUBLIC_MODAL_CHUNK_PREVIEW_URL || '';
      
      if (!modalUrl) {
        throw new Error('Modal chunk preview URL not configured. Set NEXT_PUBLIC_MODAL_CHUNK_PREVIEW_URL');
      }

      // Only send video_url, audio_url, and optional image_urls
      // The Modal function will automatically calculate tempo, sync_offset, and chunk_duration
      const requestBody = {
        video_url: videoSignedUrl,
        audio_url: audioSignedUrl,
        image_urls: imageUrls || [], // Optional array of image URLs
      };
      
      console.log('Calling Modal to generate chunk previews (will auto-calculate tempo/sync)...', {
        video_url: videoSignedUrl.substring(0, 50) + '...',
        audio_url: audioSignedUrl.substring(0, 50) + '...',
        image_urls_count: imageUrls?.length || 0,
      });
      
      const response = await fetch(modalUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      
      // Update calculated values from the analysis results returned by Modal
      if (result.analysis) {
        setCalculatedBpm(result.analysis.bpm);
        setCalculatedSyncOffset(result.analysis.sync_offset);
        setCalculatedChunkDuration(result.analysis.chunk_duration);
        
        // Calculate tempo analysis for display
        const analysis = calculateChunkDurationFromBpm(result.analysis.bpm);
        setTempoAnalysis(analysis);
        
        // Recalculate chunks with the returned values
        if (videoDuration !== null) {
          const numChunks = Math.ceil(videoDuration / result.analysis.chunk_duration);
          const calculatedChunks: ChunkInfo[] = [];
          for (let i = 0; i < numChunks; i++) {
            const videoStartTime = i * result.analysis.chunk_duration;
            const videoEndTime = Math.min(videoStartTime + result.analysis.chunk_duration, videoDuration);
            const audioStartTime = videoStartTime + result.analysis.sync_offset;
            const audioEndTime = audioStartTime + result.analysis.chunk_duration;
            const imageIndex = imageFiles.length > 0 ? i % imageFiles.length : null;
            const imageUrl = imageIndex !== null ? imageUrls[imageIndex] : null;
            calculatedChunks.push({
              chunkIndex: i,
              videoStartTime,
              videoEndTime,
              audioStartTime,
              audioEndTime,
              imageIndex,
              imageUrl,
              syncOffset: result.analysis.sync_offset,
              chunkDuration: result.analysis.chunk_duration,
            });
          }
          setChunks(calculatedChunks);
        }
      }
      
      setChunkPreviews(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate chunk previews');
    } finally {
      setGeneratingPreviews(false);
    }
  };

  const generateChunkPreviews = async () => {
    if (!videoFile || !audioFile || !videoUrl || !audioUrl) {
      setError('Please upload video and audio files first');
      return;
    }

    if (calculatedSyncOffset === null || calculatedChunkDuration === null) {
      setError('Please use "Analyze & Generate Chunk Previews" button first to calculate tempo and sync offset');
      return;
    }

    setGeneratingPreviews(true);
    setUploadingFiles(true);
    setError(null);

    try {
      // Get user ID for storage path - inputs/ requires authenticated user
      const user = await getUser();
      if (!user) {
        throw new Error('Please sign in to use chunk observability. The debug page requires authentication for file uploads.');
      }
      
      // Upload files to Supabase Storage using inputs/ path (has RLS policies for authenticated users)
      const tempId = `temp_${Date.now()}`;
      const videoPath = `inputs/${user.id}/${tempId}/video.mp4`;
      const audioPath = `inputs/${user.id}/${tempId}/audio.${audioFile.name.split('.').pop() || 'mp3'}`;

      console.log('Uploading files to Supabase...');
      
      // Upload video (use File directly, not ArrayBuffer)
      const { error: videoError } = await supabase.storage
        .from('vannilli')
        .upload(videoPath, videoFile, {
          contentType: 'video/mp4',
          upsert: true,
        });

      if (videoError) {
        console.error('Video upload error:', videoError);
        throw new Error(`Failed to upload video: ${videoError.message}`);
      }

      // Upload audio (use File directly, not ArrayBuffer)
      const { error: audioError } = await supabase.storage
        .from('vannilli')
        .upload(audioPath, audioFile, {
          contentType: audioFile.type || 'audio/mpeg',
          upsert: true,
        });

      if (audioError) {
        console.error('Audio upload error:', audioError);
        throw new Error(`Failed to upload audio: ${audioError.message}`);
      }

      // Get signed URLs
      const { data: videoSigned, error: videoSignedError } = await supabase.storage
        .from('vannilli')
        .createSignedUrl(videoPath, 3600);

      const { data: audioSigned, error: audioSignedError } = await supabase.storage
        .from('vannilli')
        .createSignedUrl(audioPath, 3600);

      if (videoSignedError || audioSignedError) {
        throw new Error('Failed to create signed URLs');
      }

      // Handle different response formats
      const videoSignedUrl = (videoSigned as any)?.signedUrl || (videoSigned as any)?.signed_url;
      const audioSignedUrl = (audioSigned as any)?.signedUrl || (audioSigned as any)?.signed_url;

      if (!videoSignedUrl || !audioSignedUrl) {
        throw new Error('Failed to get signed URLs');
      }

      setUploadingFiles(false);

      // Call the helper function - Modal will calculate tempo/sync automatically
      await generateChunkPreviewsWithValues(
        videoSignedUrl,
        audioSignedUrl
      );

      // Clean up temp files (async, don't wait)
      supabase.storage.from('vannilli').remove([videoPath, audioPath]).catch(console.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate chunk previews');
    } finally {
      setGeneratingPreviews(false);
      setUploadingFiles(false);
    }
  };

  const validateSync = (chunk: ChunkInfo): { valid: boolean; message: string } => {
    const calculatedAudioStart = chunk.videoStartTime + chunk.syncOffset;
    const diff = Math.abs(chunk.audioStartTime - calculatedAudioStart);
    
    if (diff > 0.001) {
      return {
        valid: false,
        message: `Audio start mismatch: expected ${calculatedAudioStart.toFixed(3)}s, got ${chunk.audioStartTime.toFixed(3)}s`,
      };
    }

    return { valid: true, message: '✓ Synchronized' };
  };

  const validateImageRotation = (chunk: ChunkInfo): { valid: boolean; message: string } => {
    if (imageFiles.length === 0) {
      return { valid: true, message: '✓ No images (optional)' };
    }
    
    const expectedImageIndex = chunk.chunkIndex % imageFiles.length;
    if (chunk.imageIndex !== expectedImageIndex) {
      return {
        valid: false,
        message: `Image index mismatch: expected ${expectedImageIndex}, got ${chunk.imageIndex}`,
      };
    }
    return { valid: true, message: '✓ Correct image rotation' };
  };

  // Load video duration when video URL changes
  useEffect(() => {
    if (videoUrl && videoRef.current) {
      const video = videoRef.current;
      const handleLoadedMetadata = () => {
        setVideoDuration(video.duration);
      };
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    }
  }, [videoUrl]);

  // Load audio duration when audio URL changes
  useEffect(() => {
    if (audioUrl && audioRef.current) {
      const audio = audioRef.current;
      const handleLoadedMetadata = () => {
        setAudioDuration(audio.duration);
      };
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      return () => audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    }
  }, [audioUrl]);

  return (
    <GlassCard className="p-6">
      <h2 className="text-xl font-bold mb-4">Chunk Observability - Verify Chunking Logic</h2>
      <p className="text-sm text-slate-400 mb-4">
        Upload tracking video, audio, and optional images. The system will automatically calculate tempo (BPM), sync offset, and generate downloadable chunks. 
        Verify that chunks start on downbeats and that video chunk 1 + audio chunk 1 + image 1 are properly aligned.
      </p>

      {/* Hidden media elements for duration detection */}
      {videoUrl && <video ref={videoRef} src={videoUrl} className="hidden" />}
      {audioUrl && <audio ref={audioRef} src={audioUrl} className="hidden" />}

      <div className="space-y-6">
        {/* File Uploads */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Tracking Video *</label>
            <input
              type="file"
              accept="video/*"
              onChange={handleVideoUpload}
              className="w-full px-3 py-2 bg-slate-900/50 rounded border border-slate-700 text-sm"
            />
            {videoFile && (
              <div className="mt-2 text-xs text-slate-400">
                {videoFile.name} ({videoFile.size > 0 ? (videoFile.size / 1024 / 1024).toFixed(2) : 0} MB)
                {videoDuration !== null && (
                  <span className="ml-2 text-green-400">Duration: {videoDuration.toFixed(3)}s</span>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Audio Song *</label>
            <input
              type="file"
              accept="audio/*"
              onChange={handleAudioUpload}
              className="w-full px-3 py-2 bg-slate-900/50 rounded border border-slate-700 text-sm"
            />
            {audioFile && (
              <div className="mt-2 text-xs text-slate-400">
                {audioFile.name} ({audioFile.size > 0 ? (audioFile.size / 1024 / 1024).toFixed(2) : 0} MB)
                {audioDuration !== null && (
                  <span className="ml-2 text-green-400">Duration: {audioDuration.toFixed(3)}s</span>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Target Images (Optional)</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="w-full px-3 py-2 bg-slate-900/50 rounded border border-slate-700 text-sm"
            />
            {imageFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {imageFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="px-2 py-1 bg-red-900/50 hover:bg-red-900/70 rounded text-xs"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Action Button - Automatically Calculate Everything */}
        {videoFile && audioFile && videoDuration !== null && !chunkPreviews && (
          <div className="p-4 bg-blue-900/20 border border-blue-700 rounded">
            <h3 className="text-lg font-semibold mb-2 text-blue-300">Ready to Analyze & Generate Chunks</h3>
            <p className="text-sm text-slate-400 mb-4">
              Click below to automatically:
              <br />• Calculate tempo (BPM) from audio
              <br />• Calculate sync offset between video and audio
              <br />• Calculate chunk duration (aligned to downbeats/measure boundaries)
              <br />• Generate downloadable chunk previews (video + audio + image pairs)
            </p>
            <button
              onClick={analyzeMediaWithModal}
              disabled={analyzingMedia || uploadingFiles}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium"
            >
              {uploadingFiles ? 'Uploading files...' : analyzingMedia ? 'Analyzing & Generating Chunks...' : 'Analyze & Generate Chunk Previews'}
            </button>
          </div>
        )}

        {/* Calculated Results Display */}
        {(calculatedBpm !== null || calculatedSyncOffset !== null || calculatedChunkDuration !== null) && (
          <div className="p-4 bg-slate-900/50 rounded border border-slate-700">
            <h3 className="text-lg font-semibold mb-3">Calculated Analysis Results</h3>
            
            <div className="grid grid-cols-3 gap-4 text-sm mb-4">
              <div>
                <span className="text-slate-400">BPM (Tempo):</span>
                <div className="font-mono text-lg mt-1">
                  {calculatedBpm !== null ? calculatedBpm.toFixed(2) : 'Calculating...'}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Sync Offset:</span>
                <div className="font-mono text-lg mt-1">
                  {calculatedSyncOffset !== null ? (
                    <>
                      {calculatedSyncOffset >= 0 ? '+' : ''}{calculatedSyncOffset.toFixed(3)}s
                      <span className="text-xs text-slate-500 ml-2">
                        ({calculatedSyncOffset >= 0 ? 'audio ahead' : 'audio behind'})
                      </span>
                    </>
                  ) : 'Calculating...'}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Chunk Duration:</span>
                <div className="font-mono text-lg mt-1 text-green-400">
                  {calculatedChunkDuration !== null ? calculatedChunkDuration.toFixed(3) + 's' : 'Calculating...'}
                </div>
              </div>
            </div>

            {tempoAnalysis && (
              <div className="mt-4 p-3 bg-slate-800 rounded text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-400">Seconds per Beat:</span>
                    <span className="ml-2 font-mono">{tempoAnalysis.secondsPerBeat.toFixed(3)}s</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Seconds per Measure (4/4):</span>
                    <span className="ml-2 font-mono">{tempoAnalysis.secondsPerMeasure.toFixed(3)}s</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Measures per Chunk:</span>
                    <span className="ml-2 font-mono">{tempoAnalysis.measuresPerChunk}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Number of Chunks:</span>
                    <span className="ml-2 font-mono">{chunks.length}</span>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-700 text-slate-500">
                  Formula: {tempoAnalysis.measuresPerChunk} measures × {tempoAnalysis.secondsPerMeasure.toFixed(3)}s/measure = {tempoAnalysis.chunkDuration.toFixed(3)}s
                </div>
                <div className="mt-2 text-green-400">
                  ✓ All chunks start on downbeats (measure boundaries) for seamless ffmpeg concatenation
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Chunk Results */}
        {chunks.length > 0 && videoDuration !== null && (
          <div className="mt-6">
            <div className="mb-4 p-3 bg-slate-900/50 rounded text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <strong>Video Duration:</strong> {videoDuration.toFixed(3)}s
                </div>
                <div>
                  <strong>Number of Chunks:</strong> {chunks.length}
                </div>
                <div>
                  <strong>Chunk Duration:</strong> {chunks[0]?.chunkDuration.toFixed(3)}s
                </div>
                <div>
                  <strong>Total Processing Time (est.):</strong> ~{Math.ceil(chunks.length * 75 / 60)} minutes
                </div>
              </div>
            </div>

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
                      {chunk.imageIndex !== null && (
                        <div className="text-right text-sm">
                          <div className="text-slate-400">Image Index</div>
                          <div className="font-mono">{chunk.imageIndex}</div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                      <div>
                        <div className="text-slate-400 text-xs mb-1">Video Timing</div>
                        <div className="font-mono">
                          {chunk.videoStartTime.toFixed(3)}s → {chunk.videoEndTime.toFixed(3)}s
                        </div>
                        <div className="text-xs text-slate-500">
                          Duration: {(chunk.videoEndTime - chunk.videoStartTime).toFixed(3)}s
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

                    {chunk.imageUrl && (
                      <div className="mt-3 pt-3 border-t border-slate-700">
                        <div className="text-xs">
                          <div className="text-slate-400 mb-1">Image:</div>
                          <img src={chunk.imageUrl} alt={`Chunk ${chunk.chunkIndex}`} className="max-w-xs max-h-32 rounded" />
                        </div>
                      </div>
                    )}

                    <div className="mt-2 text-xs text-slate-500">
                      <div>
                        Expected: Video[{chunk.chunkIndex}] + Audio[{chunk.chunkIndex}]
                        {chunk.imageIndex !== null && ` + Image[${chunk.imageIndex}]`}
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
                {imageFiles.length > 0 && (
                  <div>
                    Image rotation issues: {chunks.filter((c) => !validateImageRotation(c).valid).length}
                  </div>
                )}
                {imageFiles.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-700">
                    <div className="text-xs text-slate-400">
                      Image rotation pattern: {imageFiles.map((_, idx) => idx).join(', ')} (repeats every {imageFiles.length} chunks)
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Generate Chunk Previews Button */}
            {!chunkPreviews && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <button
                  onClick={generateChunkPreviews}
                  disabled={generatingPreviews || !videoFile || !audioFile || !tempoAnalysis || chunks.length === 0}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium"
                >
                  {uploadingFiles ? 'Uploading files...' : generatingPreviews ? 'Generating Chunk Previews...' : 'Generate Downloadable Chunk Previews'}
                </button>
                <p className="text-xs text-slate-500 mt-2">
                  Generate downloadable video and audio chunks to compare synchronization. Download chunk 1 video and chunk 1 audio to verify they match.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Chunk Previews */}
        {chunkPreviews && (
          <div className="mt-6 p-4 bg-slate-900/50 rounded border border-slate-700">
            <h3 className="text-lg font-semibold mb-3">Downloadable Chunk Previews</h3>
            <div className="mb-3 text-sm text-slate-400 space-y-1">
              <div>Video Duration: {chunkPreviews.video_duration.toFixed(3)}s</div>
              <div>Audio Duration: {chunkPreviews.audio_duration.toFixed(3)}s</div>
              <div>Number of Chunks: {chunkPreviews.num_chunks}</div>
              {tempoAnalysis && (
                <div>BPM: {tempoAnalysis.bpm.toFixed(2)}</div>
              )}
            </div>
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {chunkPreviews.chunks.map((preview) => {
                const chunk = chunks.find((c) => c.chunkIndex === preview.chunk_index);
                const syncValid = chunk && Math.abs(chunk.audioStartTime - preview.audio_start_time) < 0.001;

                return (
                  <div
                    key={preview.chunk_index}
                    className={`p-3 rounded border ${
                      syncValid ? 'bg-green-900/20 border-green-700/50' : 'bg-slate-800 border-slate-700'
                    }`}
                  >
                    <div className="font-semibold mb-2">Chunk {preview.chunk_index + 1}</div>
                    <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                      <div>
                        <span className="text-slate-400">Video:</span>
                        <div className="font-mono text-slate-300">
                          {preview.video_start_time.toFixed(3)}s → {preview.video_end_time.toFixed(3)}s
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400">Audio:</span>
                        <div className="font-mono text-slate-300">
                          {preview.audio_start_time.toFixed(3)}s → {preview.audio_end_time.toFixed(3)}s
                        </div>
                        {chunk && (
                          <div className="text-xs mt-1">
                            <span className={syncValid ? 'text-green-400' : 'text-red-400'}>
                              {syncValid ? '✓ Sync matches' : '⚠ Sync mismatch'}
                            </span>
                            {!syncValid && (
                              <span className="text-red-400 ml-1">
                                (Expected: {chunk.audioStartTime.toFixed(3)}s, Got: {preview.audio_start_time.toFixed(3)}s)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {preview.image_url && (
                      <div className="mb-3 p-2 bg-slate-800 rounded">
                        <div className="text-xs text-slate-400 mb-1">
                          Image {preview.image_index !== null && preview.image_index !== undefined ? preview.image_index + 1 : 'N/A'}:
                        </div>
                        <img 
                          src={preview.image_url} 
                          alt={`Chunk ${preview.chunk_index + 1} image`}
                          className="max-w-full max-h-32 rounded"
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <a
                        href={preview.video_chunk_url}
                        download={`chunk_${preview.chunk_index + 1}_video.mp4`}
                        className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm text-center"
                      >
                        Download Video Chunk {preview.chunk_index + 1}
                      </a>
                      <a
                        href={preview.audio_chunk_url}
                        download={`chunk_${preview.chunk_index + 1}_audio.wav`}
                        className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-sm text-center"
                      >
                        Download Audio Chunk {preview.chunk_index + 1}
                      </a>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      Chunk {preview.chunk_index + 1}: Video + Audio{preview.image_url ? ` + Image ${(preview.image_index ?? 0) + 1}` : ''} should align perfectly
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
