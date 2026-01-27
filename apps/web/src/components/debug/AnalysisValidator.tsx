'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { GlassCard } from '../ui/GlassCard';

interface VideoJobAnalysis {
  id: string;
  generation_id: string | null;
  sync_offset: number | null;
  bpm: number | null;
  chunk_duration: number | null;
  analysis_status: string;
  user_video_url: string | null;
  master_audio_url: string | null;
  target_images: string[] | null;
  created_at: string;
}

interface ChunkData {
  chunk_index: number;
  video_chunk_start_time: number | null;
  audio_start_time: number | null;
  sync_offset: number | null;
  chunk_duration: number | null;
  image_index: number | null;
  status: string;
}

interface ChunkPreview {
  chunk_index: number;
  video_chunk_url: string;
  audio_chunk_url: string;
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

export function AnalysisValidator() {
  const [generationId, setGenerationId] = useState('');
  const [jobId, setJobId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<VideoJobAnalysis | null>(null);
  const [chunks, setChunks] = useState<ChunkData[]>([]);
  const [chunkPreviews, setChunkPreviews] = useState<ChunkPreviewResult | null>(null);
  const [generatingPreviews, setGeneratingPreviews] = useState(false);

  const fetchAnalysis = async () => {
    if (!generationId && !jobId) {
      setError('Please enter either a Generation ID or Job ID');
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysis(null);
    setChunks([]);

    try {
      let jobData: VideoJobAnalysis | null = null;

      // If generation_id provided, find the job
      if (generationId) {
        const { data: job, error: jobError } = await supabase
          .from('video_jobs')
          .select('*')
          .eq('generation_id', generationId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (jobError) throw jobError;
        jobData = job as VideoJobAnalysis;
      } else if (jobId) {
        const { data: job, error: jobError } = await supabase
          .from('video_jobs')
          .select('*')
          .eq('id', jobId)
          .single();

        if (jobError) throw jobError;
        jobData = job as VideoJobAnalysis;
      }

      if (!jobData) {
        setError('Job not found');
        setLoading(false);
        return;
      }

      setAnalysis(jobData);

      // Fetch chunks if generation_id exists
      if (jobData.generation_id) {
        const { data: chunkData, error: chunkError } = await supabase
          .from('video_chunks')
          .select('chunk_index, video_chunk_start_time, audio_start_time, sync_offset, chunk_duration, image_index, status')
          .eq('generation_id', jobData.generation_id)
          .order('chunk_index', { ascending: true });

        if (chunkError) {
          console.error('Error fetching chunks:', chunkError);
        } else {
          setChunks((chunkData || []) as ChunkData[]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analysis');
    } finally {
      setLoading(false);
    }
  };

  const generateChunkPreviews = async () => {
    if (!analysis || !analysis.user_video_url || !analysis.master_audio_url) {
      setError('Missing video or audio URL');
      return;
    }

    if (analysis.sync_offset === null || analysis.chunk_duration === null) {
      setError('Sync offset or chunk duration not calculated');
      return;
    }

    setGeneratingPreviews(true);
    setError(null);

    try {
      // Get Modal URL from environment or construct it
      // You'll need to set NEXT_PUBLIC_MODAL_CHUNK_PREVIEW_URL in your environment
      const modalUrl = process.env.NEXT_PUBLIC_MODAL_CHUNK_PREVIEW_URL || '';
      
      if (!modalUrl) {
        throw new Error('Modal chunk preview URL not configured. Set NEXT_PUBLIC_MODAL_CHUNK_PREVIEW_URL');
      }

      const response = await fetch(modalUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video_url: analysis.user_video_url,
          audio_url: analysis.master_audio_url,
          sync_offset: analysis.sync_offset,
          chunk_duration: analysis.chunk_duration,
          generation_id: analysis.generation_id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      setChunkPreviews(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate chunk previews');
    } finally {
      setGeneratingPreviews(false);
    }
  };

  const calculateExpectedChunkDuration = (bpm: number): number => {
    const secondsPerBeat = 60.0 / bpm;
    const secondsPerMeasure = secondsPerBeat * 4;
    const targetDuration = 9.0;
    let measuresPerChunk = Math.max(1, Math.floor(targetDuration / secondsPerMeasure));
    let chunkDuration = measuresPerChunk * secondsPerMeasure;

    if (chunkDuration > 9.0) {
      measuresPerChunk -= 1;
      chunkDuration = measuresPerChunk * secondsPerMeasure;
    }

    if (chunkDuration < secondsPerMeasure) {
      chunkDuration = secondsPerMeasure;
    }

    return chunkDuration;
  };

  return (
    <GlassCard className="p-6">
      <h2 className="text-xl font-bold mb-4">Validate Calculated Analysis Values</h2>
      <p className="text-sm text-slate-400 mb-4">
        Query existing generations/jobs to see the sync_offset, BPM, and chunk_duration calculated by Modal's media_analyzer.
        Use this to debug sync issues by comparing calculated values with expected values.
      </p>

      <div className="space-y-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1">Generation ID</label>
          <input
            type="text"
            value={generationId}
            onChange={(e) => {
              setGenerationId(e.target.value);
              setJobId(''); // Clear job ID when generation ID is set
            }}
            placeholder="UUID of generation"
            className="w-full px-3 py-2 bg-slate-900/50 rounded border border-slate-700 text-sm"
          />
        </div>

        <div className="text-center text-slate-500 text-sm">OR</div>

        <div>
          <label className="block text-sm font-medium mb-1">Job ID</label>
          <input
            type="text"
            value={jobId}
            onChange={(e) => {
              setJobId(e.target.value);
              setGenerationId(''); // Clear generation ID when job ID is set
            }}
            placeholder="UUID of video_job"
            className="w-full px-3 py-2 bg-slate-900/50 rounded border border-slate-700 text-sm"
          />
        </div>

        <button
          onClick={fetchAnalysis}
          disabled={loading}
          className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded text-sm font-medium"
        >
          {loading ? 'Loading...' : 'Fetch Analysis Data'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm mb-4">
          {error}
        </div>
      )}

      {analysis && (
        <div className="space-y-6">
          <div className="p-4 bg-slate-900/50 rounded border border-slate-700">
            <h3 className="text-lg font-semibold mb-3">Analysis Results from Modal</h3>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-400">Sync Offset:</span>
                <div className="font-mono text-lg mt-1">
                  {analysis.sync_offset !== null ? (
                    <>
                      {analysis.sync_offset >= 0 ? '+' : ''}{analysis.sync_offset.toFixed(3)}s
                      <span className="text-xs text-slate-500 ml-2">
                        ({analysis.sync_offset >= 0 ? 'audio ahead' : 'audio behind'})
                      </span>
                    </>
                  ) : (
                    <span className="text-red-400">Not calculated</span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-slate-400">BPM:</span>
                <div className="font-mono text-lg mt-1">
                  {analysis.bpm !== null ? (
                    <>
                      {analysis.bpm.toFixed(2)}
                      {analysis.bpm < 60 || analysis.bpm > 200 ? (
                        <span className="text-red-400 ml-2">⚠ Out of range</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-red-400">Not calculated</span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-slate-400">Chunk Duration:</span>
                <div className="font-mono text-lg mt-1">
                  {analysis.chunk_duration !== null ? (
                    <>
                      {analysis.chunk_duration.toFixed(3)}s
                      {analysis.chunk_duration > 9.0 ? (
                        <span className="text-red-400 ml-2">⚠ Exceeds 9s limit</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-red-400">Not calculated</span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-slate-400">Analysis Status:</span>
                <div className="mt-1">
                  <span className={`px-2 py-1 rounded text-xs ${
                    analysis.analysis_status === 'ANALYZED' ? 'bg-green-900/50 text-green-300' :
                    analysis.analysis_status === 'FAILED' ? 'bg-red-900/50 text-red-300' :
                    'bg-yellow-900/50 text-yellow-300'
                  }`}>
                    {analysis.analysis_status}
                  </span>
                </div>
              </div>
            </div>

            {analysis.bpm !== null && (
              <div className="mt-4 p-3 bg-slate-800 rounded">
                <h4 className="font-semibold mb-2 text-sm">Expected Chunk Duration Calculation</h4>
                <div className="text-xs space-y-1 font-mono">
                  <div>BPM: {analysis.bpm.toFixed(2)}</div>
                  <div>Seconds per beat: {(60.0 / analysis.bpm).toFixed(3)}s</div>
                  <div>Seconds per measure (4/4): {((60.0 / analysis.bpm) * 4).toFixed(3)}s</div>
                  <div>Measures per chunk: {Math.max(1, Math.floor(9.0 / ((60.0 / analysis.bpm) * 4)))}</div>
                  <div className="pt-2 border-t border-slate-700">
                    <strong>Expected chunk duration:</strong>{' '}
                    <span className="text-green-400">
                      {calculateExpectedChunkDuration(analysis.bpm).toFixed(3)}s
                    </span>
                  </div>
                  {analysis.chunk_duration !== null && (
                    <div className={Math.abs(analysis.chunk_duration - calculateExpectedChunkDuration(analysis.bpm)) < 0.001 ? 'text-green-400' : 'text-red-400'}>
                      <strong>Calculated chunk duration:</strong>{' '}
                      {analysis.chunk_duration.toFixed(3)}s
                      {Math.abs(analysis.chunk_duration - calculateExpectedChunkDuration(analysis.bpm)) >= 0.001 && (
                        <span className="ml-2">⚠ Mismatch!</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-slate-700">
              <h4 className="font-semibold mb-2 text-sm">Media URLs</h4>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-400">Video:</span>
                  <div className="truncate text-slate-300 mt-1">{analysis.user_video_url || 'N/A'}</div>
                </div>
                <div>
                  <span className="text-slate-400">Audio:</span>
                  <div className="truncate text-slate-300 mt-1">{analysis.master_audio_url || 'N/A'}</div>
                </div>
                <div>
                  <span className="text-slate-400">Images:</span>
                  <div className="text-slate-300 mt-1">
                    {analysis.target_images && analysis.target_images.length > 0 ? (
                      <div className="space-y-1">
                        {analysis.target_images.map((url, idx) => (
                          <div key={idx} className="truncate">[{idx}] {url}</div>
                        ))}
                      </div>
                    ) : (
                      'None'
                    )}
                  </div>
                </div>
              </div>
            </div>

            {analysis.sync_offset !== null && analysis.chunk_duration !== null && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <button
                  onClick={generateChunkPreviews}
                  disabled={generatingPreviews || !analysis.user_video_url || !analysis.master_audio_url}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-sm font-medium"
                >
                  {generatingPreviews ? 'Generating Chunk Previews...' : 'Generate Chunk Previews for Download'}
                </button>
                <p className="text-xs text-slate-500 mt-2">
                  Generate downloadable video and audio chunks to compare synchronization
                </p>
              </div>
            )}
          </div>

          {chunkPreviews && (
            <div className="p-4 bg-slate-900/50 rounded border border-slate-700">
              <h3 className="text-lg font-semibold mb-3">Chunk Previews (Downloadable)</h3>
              <div className="mb-3 text-sm text-slate-400">
                <div>Video Duration: {chunkPreviews.video_duration.toFixed(3)}s</div>
                <div>Audio Duration: {chunkPreviews.audio_duration.toFixed(3)}s</div>
                <div>Number of Chunks: {chunkPreviews.num_chunks}</div>
                {analysis.bpm && <div>BPM: {analysis.bpm.toFixed(2)}</div>}
              </div>
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {chunkPreviews.chunks.map((preview) => (
                  <div
                    key={preview.chunk_index}
                    className="p-3 rounded border border-slate-700 bg-slate-800"
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
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={preview.video_chunk_url}
                        download={`chunk_${preview.chunk_index}_video.mp4`}
                        className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm text-center"
                      >
                        Download Video Chunk {preview.chunk_index + 1}
                      </a>
                      <a
                        href={preview.audio_chunk_url}
                        download={`chunk_${preview.chunk_index}_audio.wav`}
                        className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-sm text-center"
                      >
                        Download Audio Chunk {preview.chunk_index + 1}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {chunks.length > 0 && (
            <div className="p-4 bg-slate-900/50 rounded border border-slate-700">
              <h3 className="text-lg font-semibold mb-3">Chunk Details (from Database)</h3>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {chunks.map((chunk) => {
                  const expectedAudioStart = (chunk.video_chunk_start_time || 0) + (analysis.sync_offset || 0);
                  const audioSyncValid = chunk.audio_start_time !== null && 
                    Math.abs(chunk.audio_start_time - expectedAudioStart) < 0.001;

                  return (
                    <div
                      key={chunk.chunk_index}
                      className={`p-3 rounded border text-sm ${
                        audioSyncValid ? 'bg-green-900/20 border-green-700/50' : 'bg-red-900/20 border-red-700/50'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="font-semibold">Chunk {chunk.chunk_index}</div>
                        <div className={`text-xs px-2 py-1 rounded ${
                          chunk.status === 'COMPLETED' ? 'bg-green-900/50 text-green-300' :
                          chunk.status === 'FAILED' ? 'bg-red-900/50 text-red-300' :
                          'bg-yellow-900/50 text-yellow-300'
                        }`}>
                          {chunk.status}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-slate-400">Video Start:</span>
                          <div className="font-mono">{chunk.video_chunk_start_time?.toFixed(3) ?? 'N/A'}s</div>
                        </div>
                        <div>
                          <span className="text-slate-400">Audio Start:</span>
                          <div className="font-mono">
                            {chunk.audio_start_time?.toFixed(3) ?? 'N/A'}s
                            {chunk.audio_start_time !== null && (
                              <span className={audioSyncValid ? 'text-green-400 ml-1' : 'text-red-400 ml-1'}>
                                {audioSyncValid ? '✓' : '✗'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-400">Sync Offset:</span>
                          <div className="font-mono">{chunk.sync_offset?.toFixed(3) ?? 'N/A'}s</div>
                        </div>
                        <div>
                          <span className="text-slate-400">Chunk Duration:</span>
                          <div className="font-mono">{chunk.chunk_duration?.toFixed(3) ?? 'N/A'}s</div>
                        </div>
                      </div>

                      {!audioSyncValid && chunk.audio_start_time !== null && (
                        <div className="mt-2 text-xs text-red-400">
                          Expected audio start: {expectedAudioStart.toFixed(3)}s, 
                          Got: {chunk.audio_start_time.toFixed(3)}s
                          (Diff: {Math.abs(chunk.audio_start_time - expectedAudioStart).toFixed(3)}s)
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}
