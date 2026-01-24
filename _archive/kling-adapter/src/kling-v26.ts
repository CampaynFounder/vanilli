/**
 * Kling AI v2.6 Motion Control API Adapter
 * 
 * Documentation: https://app.klingai.com/global/dev/document-api/apiReference/model/motionControl
 */

import { fetch } from 'undici';
import type {
  IVideoGenerator,
  VideoGenerationRequest,
  VideoGenerationResponse,
  ProviderConfig,
  GenerationStatus,
} from './types';
import { VideoGeneratorError } from './types';

/**
 * Kling API request payload
 */
interface KlingMotionControlRequest {
  model_name: 'kling-v2';
  driver_video_url: string;
  target_image_url: string;
  prompt?: string;
  mode?: 'standard' | 'pro';
  character_orientation: 'image' | 'video';
}

/**
 * Kling API response
 */
interface KlingApiResponse {
  code: number;
  message: string;
  data?: {
    task_id: string;
    task_status: string;
    task_result?: {
      videos?: Array<{
        id: string;
        url: string;
        duration: number;
      }>;
    };
  };
}

/**
 * Map Kling status to our generic status
 */
function mapKlingStatus(klingStatus: string): GenerationStatus {
  const statusMap: Record<string, GenerationStatus> = {
    submitted: 'pending',
    processing: 'processing',
    succeed: 'completed',
    failed: 'failed',
  };
  return statusMap[klingStatus] || 'pending';
}

/**
 * Kling v2.6 implementation of video generator
 */
export class KlingV26Adapter implements IVideoGenerator {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.klingai.com/v1';
    this.timeout = config.timeout || 120000; // 2 minutes default
  }

  /**
   * Start a video generation job
   */
  async startGeneration(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    const payload: KlingMotionControlRequest = {
      model_name: 'kling-v2',
      driver_video_url: request.driverVideoUrl,
      target_image_url: request.targetImageUrl,
      mode: request.mode || 'standard',
      character_orientation: request.characterOrientation,
    };

    if (request.prompt) {
      payload.prompt = request.prompt;
    }

    try {
      const response = await fetch(`${this.baseUrl}/videos/motion-control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new VideoGeneratorError(
          `Kling API request failed: ${response.statusText}`,
          'KLING_REQUEST_FAILED',
          response.status
        );
      }

      const data = (await response.json()) as KlingApiResponse;

      if (data.code !== 0) {
        throw new VideoGeneratorError(
          `Kling API error: ${data.message}`,
          'KLING_API_ERROR',
          undefined,
          data
        );
      }

      if (!data.data?.task_id) {
        throw new VideoGeneratorError(
          'Kling API did not return task ID',
          'KLING_INVALID_RESPONSE',
          undefined,
          data
        );
      }

      return {
        taskId: data.data.task_id,
        status: 'pending',
        estimatedCompletionSeconds: 90, // Kling typically takes 60-120s
      };
    } catch (error) {
      if (error instanceof VideoGeneratorError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new VideoGeneratorError(
          `Failed to start generation: ${error.message}`,
          'KLING_NETWORK_ERROR',
          undefined,
          error
        );
      }

      throw new VideoGeneratorError(
        'Unknown error starting generation',
        'KLING_UNKNOWN_ERROR',
        undefined,
        error
      );
    }
  }

  /**
   * Check status of an existing generation
   */
  async checkStatus(taskId: string): Promise<VideoGenerationResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/videos/motion-control/${taskId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(10000), // 10s timeout for status checks
      });

      if (!response.ok) {
        throw new VideoGeneratorError(
          `Kling API status check failed: ${response.statusText}`,
          'KLING_STATUS_CHECK_FAILED',
          response.status
        );
      }

      const data = (await response.json()) as KlingApiResponse;

      if (data.code !== 0) {
        throw new VideoGeneratorError(
          `Kling API error: ${data.message}`,
          'KLING_API_ERROR',
          undefined,
          data
        );
      }

      if (!data.data) {
        throw new VideoGeneratorError(
          'Kling API did not return task data',
          'KLING_INVALID_RESPONSE',
          undefined,
          data
        );
      }

      const status = mapKlingStatus(data.data.task_status);
      const result: VideoGenerationResponse = {
        taskId,
        status,
      };

      // If completed, extract video URL
      if (status === 'completed' && data.data.task_result?.videos?.length) {
        const video = data.data.task_result.videos[0];
        result.videoUrl = video.url;
      }

      // If failed, extract error
      if (status === 'failed') {
        result.error = data.message || 'Video generation failed';
      }

      return result;
    } catch (error) {
      if (error instanceof VideoGeneratorError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new VideoGeneratorError(
          `Failed to check status: ${error.message}`,
          'KLING_NETWORK_ERROR',
          undefined,
          error
        );
      }

      throw new VideoGeneratorError(
        'Unknown error checking status',
        'KLING_UNKNOWN_ERROR',
        undefined,
        error
      );
    }
  }

  /**
   * Cancel a generation (Kling API doesn't support this, so we just mark as failed)
   */
  async cancelGeneration(taskId: string): Promise<void> {
    // Kling v2.6 doesn't have a cancel endpoint
    // In production, you might want to track cancellation in your own database
    console.warn(`Cancellation requested for ${taskId}, but Kling API doesn't support cancellation`);
  }
}


