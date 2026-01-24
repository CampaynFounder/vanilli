/**
 * Cloudflare Queue consumer for video generation
 * 
 * This worker processes video generation jobs from the queue
 */

import { KlingV26Adapter } from '@vannilli/kling-adapter';
import { createClient } from '@supabase/supabase-js';
import type { VideoGenerationMessage } from '../types';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  KLING_API_KEY: string;
  KLING_API_URL: string;
  FINAL_RENDERS: R2Bucket;
  FFMPEG_SERVICE_URL?: string;
}

export default {
  async queue(batch: MessageBatch<VideoGenerationMessage>, env: Env): Promise<void> {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    const klingAdapter = new KlingV26Adapter({
      apiKey: env.KLING_API_KEY,
      baseUrl: env.KLING_API_URL,
    });

    for (const message of batch.messages) {
      try {
        const job = message.body;

        // Start Kling generation
        const result = await klingAdapter.startGeneration({
          driverVideoUrl: job.driverVideoUrl,
          targetImageUrl: job.targetImageUrl,
          prompt: job.prompt,
          mode: job.mode || 'standard',
          characterOrientation: 'image',
        });

        // Update generation with Kling task ID
        await supabase
          .from('generations')
          .update({
            kling_task_id: result.taskId,
            status: 'processing',
          })
          .eq('internal_task_id', job.internalTaskId);

        // Poll for completion (simplified - in production, use a separate polling worker)
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes max (5s intervals)

        while (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5s

          const status = await klingAdapter.checkStatus(result.taskId);

          if (status.status === 'completed' && status.videoUrl) {
            let finalVideoBuffer: ArrayBuffer;

            // If we have user audio and an FFmpeg service, merge Kling video + user audio (and optional watermark)
            if (job.audioTrackUrl && env.FFMPEG_SERVICE_URL) {
              const mergeUrl = `${env.FFMPEG_SERVICE_URL.replace(/\/$/, '')}/merge`;
              const mergeRes = await fetch(mergeUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  klingVideoUrl: status.videoUrl,
                  audioTrackUrl: job.audioTrackUrl,
                  addWatermark: job.isTrial === true,
                }),
              });
              if (!mergeRes.ok) {
                const errText = await mergeRes.text();
                throw new Error(`FFmpeg merge failed: ${mergeRes.status} ${errText}`);
              }
              finalVideoBuffer = await mergeRes.arrayBuffer();
            } else {
              // No FFmpeg service or no audio: use Kling output as-is (Kling's video has its own audio)
              const videoResponse = await fetch(status.videoUrl);
              finalVideoBuffer = await videoResponse.arrayBuffer();
            }

            // Upload to R2
            const videoKey = `videos/${job.generationId}/final.mp4`;
            await env.FINAL_RENDERS.put(videoKey, finalVideoBuffer);

            // Update database
            await supabase
              .from('generations')
              .update({
                status: 'completed',
                final_video_r2_path: videoKey,
                completed_at: new Date().toISOString(),
              })
              .eq('internal_task_id', job.internalTaskId);

            // Update project status
            await supabase
              .from('projects')
              .update({ status: 'completed' })
              .eq('id', (await supabase.from('generations').select('project_id').eq('internal_task_id', job.internalTaskId).single()).data?.project_id);

            break;
          }

          if (status.status === 'failed') {
            await supabase
              .from('generations')
              .update({
                status: 'failed',
                error_message: status.error || 'Video generation failed',
              })
              .eq('internal_task_id', job.internalTaskId);

            break;
          }

          attempts++;
        }

        if (attempts >= maxAttempts) {
          // Timeout
          await supabase
            .from('generations')
            .update({
              status: 'failed',
              error_message: 'Generation timeout after 5 minutes',
            })
            .eq('internal_task_id', job.internalTaskId);
        }

        message.ack();
      } catch (error) {
        console.error('Queue processing error:', error);
        message.retry();
      }
    }
  },
};


