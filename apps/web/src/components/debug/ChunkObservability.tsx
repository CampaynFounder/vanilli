'use client';

import { useState, useRef, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';

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

export function ChunkObservability() {
  // File uploads
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  
  // File URLs for preview
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  
  // Analysis results
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [syncOffset, setSyncOffset] = useState<number>(0);
  const [bpm, setBpm] = useState<number | null>(null);
  const [tempoAnalysis, setTempoAnalysis] = useState<TempoAnalysis | null>(null);
  const [chunks, setChunks] = useState<ChunkInfo[]>([]);
  
  // Manual inputs
  const [manualBpm, setManualBpm] = useState<string>('');
  const [useManualBpm, setUseManualBpm] = useState(false);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  
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
    setBpm(null);
    setTempoAnalysis(null);
    setChunks([]);
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
    const beatsPerSecond = bpmValue / 60.0;
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

  const analyzeAudio = async () => {
    if (!audioFile) {
      setError('Please upload an audio file first');
      return;
    }

    setAnalyzing(true);
    setError(null);

    try {
      // For now, we'll use manual BPM input since browser-based tempo detection
      // requires complex audio analysis libraries. The user can input BPM manually
      // or we can show instructions for using external tools.
      
      // If manual BPM is provided, use it
      if (useManualBpm && manualBpm) {
        const bpmValue = parseFloat(manualBpm);
        if (isNaN(bpmValue) || bpmValue < 60 || bpmValue > 200) {
          setError('BPM must be between 60 and 200');
          setAnalyzing(false);
          return;
        }
        
        setBpm(bpmValue);
        const analysis = calculateChunkDurationFromBpm(bpmValue);
        setTempoAnalysis(analysis);
        setAnalyzing(false);
      } else {
        // Show instructions for manual BPM input
        setError('Please enter BPM manually or use a tool like Audacity to detect tempo');
        setAnalyzing(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze audio');
      setAnalyzing(false);
    }
  };

  const calculateChunks = () => {
    if (!videoFile || !videoUrl) {
      setError('Please upload a tracking video');
      return;
    }
    
    if (!audioFile || !audioUrl) {
      setError('Please upload an audio file');
      return;
    }

    if (!tempoAnalysis) {
      setError('Please analyze audio tempo first');
      return;
    }

    if (!videoDuration) {
      setError('Video duration not loaded. Please wait for video to load.');
      return;
    }

    setError(null);
    setLoading(true);

    const chunkDuration = tempoAnalysis.chunkDuration;
    const numChunks = Math.ceil(videoDuration / chunkDuration);
    const calculatedChunks: ChunkInfo[] = [];

    for (let i = 0; i < numChunks; i++) {
      const videoStartTime = i * chunkDuration;
      const videoEndTime = Math.min(videoStartTime + chunkDuration, videoDuration);
      const audioStartTime = videoStartTime + (syncOffset || 0);
      const audioEndTime = audioStartTime + chunkDuration;
      
      // Images are optional
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
        syncOffset: syncOffset || 0,
        chunkDuration,
      });
    }

    setChunks(calculatedChunks);
    setLoading(false);
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
      <h2 className="text-xl font-bold mb-4">Chunk Observability with File Upload</h2>
      <p className="text-sm text-slate-400 mb-4">
        Upload your tracking video and audio to verify chunk calculations, tempo analysis, and synchronization before sending to Kling.
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

        {/* Tempo Analysis */}
        <div className="p-4 bg-slate-900/30 rounded border border-slate-700">
          <h3 className="text-lg font-semibold mb-3">Tempo Analysis</h3>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">BPM (Beats Per Minute)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={manualBpm}
                  onChange={(e) => setManualBpm(e.target.value)}
                  placeholder="e.g., 120"
                  min="60"
                  max="200"
                  step="0.1"
                  className="flex-1 px-3 py-2 bg-slate-900 rounded border border-slate-700 text-sm"
                />
                <button
                  type="button"
                  onClick={analyzeAudio}
                  disabled={analyzing || !manualBpm}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded text-sm font-medium"
                >
                  {analyzing ? 'Analyzing...' : 'Calculate Chunk Duration'}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Enter BPM manually (60-200). Use tools like Audacity, Rekordbox, or tap tempo to detect.
              </p>
            </div>

            {tempoAnalysis && (
              <div className="mt-4 p-3 bg-slate-800 rounded">
                <h4 className="font-semibold mb-2">Tempo Analysis Results</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-400">BPM:</span>
                    <span className="ml-2 font-mono">{tempoAnalysis.bpm.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Seconds per Beat:</span>
                    <span className="ml-2 font-mono">{tempoAnalysis.secondsPerBeat.toFixed(3)}s</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Seconds per Measure:</span>
                    <span className="ml-2 font-mono">{tempoAnalysis.secondsPerMeasure.toFixed(3)}s</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Measures per Chunk:</span>
                    <span className="ml-2 font-mono">{tempoAnalysis.measuresPerChunk}</span>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-slate-700">
                    <span className="text-slate-400">Calculated Chunk Duration:</span>
                    <span className="ml-2 font-mono text-lg text-green-400">{tempoAnalysis.chunkDuration.toFixed(3)}s</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Formula: {tempoAnalysis.measuresPerChunk} measures × {tempoAnalysis.secondsPerMeasure.toFixed(3)}s/measure = {tempoAnalysis.chunkDuration.toFixed(3)}s
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sync Offset */}
        <div>
          <label className="block text-sm font-medium mb-1">Sync Offset (seconds)</label>
          <input
            type="number"
            value={syncOffset}
            onChange={(e) => setSyncOffset(parseFloat(e.target.value) || 0)}
            step="0.001"
            className="w-full px-3 py-2 bg-slate-900/50 rounded border border-slate-700 text-sm"
          />
          <p className="text-xs text-slate-500 mt-1">
            Audio alignment offset. Positive = audio is ahead of video, Negative = audio is behind video.
          </p>
        </div>

        {/* Calculate Chunks Button */}
        <button
          onClick={calculateChunks}
          disabled={loading || !videoFile || !audioFile || !tempoAnalysis}
          className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium"
        >
          {loading ? 'Calculating...' : 'Calculate Chunks'}
        </button>

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
          </div>
        )}
      </div>
    </GlassCard>
  );
}
