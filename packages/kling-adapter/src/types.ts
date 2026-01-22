/**
 * @vannilli/kling-adapter
 * 
 * Model-agnostic video generation interface
 */

/**
 * Video generation request
 */
export interface VideoGenerationRequest {
  driverVideoUrl: string;      // URL to driver video (user's performance)
  targetImageUrl: string;       // URL to target image (AI art/character)
  prompt?: string;              // Optional motion/camera prompt
  mode?: 'standard' | 'pro';    // Generation quality mode
  characterOrientation: 'image' | 'video';  // Which asset is the character
}

/**
 * Video generation status
 */
export type GenerationStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Video generation response
 */
export interface VideoGenerationResponse {
  taskId: string;               // Provider's task ID
  status: GenerationStatus;
  videoUrl?: string;            // Final video URL (when completed)
  thumbnailUrl?: string;        // Thumbnail URL
  estimatedCompletionSeconds?: number;
  progress?: number;            // 0-100 percentage
  error?: string;               // Error message if failed
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  timeout?: number;             // Request timeout in ms
}

/**
 * Abstract video generator interface
 * 
 * This interface allows us to swap AI providers without changing application code.
 * Implementations: KlingV26Adapter, RunwayGen3Adapter, PikaAdapter
 */
export interface IVideoGenerator {
  /**
   * Start a video generation job
   */
  startGeneration(request: VideoGenerationRequest): Promise<VideoGenerationResponse>;

  /**
   * Check status of an existing generation
   */
  checkStatus(taskId: string): Promise<VideoGenerationResponse>;

  /**
   * Cancel a generation (if supported)
   */
  cancelGeneration(taskId: string): Promise<void>;
}

/**
 * Video generator error types
 */
export class VideoGeneratorError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'VideoGeneratorError';
  }
}

