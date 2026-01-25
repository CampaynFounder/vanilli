'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useSignupModal } from '@/hooks/useSignupModal';

// Fullscreen API vendor prefixes
interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
  mozRequestFullScreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

interface Video {
  id: string;
  thumbnail?: string;
  videoUrl: string;
  title: string;
  artist: string;
  label?: string;
  duration: string;
  bpm?: number;
  bars?: number;
  playCount?: number; // Display count for network effect
}

// Placeholder data - replace with your actual videos
// 
// ⚠️ REMINDER: When adding a new video here, you MUST also:
// 1. Convert video to .mp4 format using convert-to-mp4.sh script
// 2. Run SQL in Supabase to add the video to video_plays table
// 3. Use pattern: INSERT INTO video_plays (video_id, video_url, display_count, actual_play_count)
//    VALUES ('video8', '/videos/video8.mp4', 12353, 0) ON CONFLICT (video_id) DO NOTHING;
// 4. See: REMINDER_ADD_VIDEO.md or packages/database/VIDEO_PLAYS_SETUP.md
//
const placeholderVideos: Video[] = [
  {
    id: 'video2',
    videoUrl: '/videos/video2.mp4',
    title: 'NCLECTA',
    artist: 'ReCe',
    label: 'Atlantic Records',
    duration: '0:30',
    bpm: 140,
    bars: 8,
  },
  {
    id: 'video3',
    videoUrl: '/videos/video3.mp4',
    title: 'Textin\' Us Bae',
    artist: 'Rezzumai',
    label: 'Universal Records',
    duration: '0:30',
    bpm: 140,
    bars: 8,
  },
  {
    id: 'video4',
    videoUrl: '/videos/video4.mp4',
    title: '8-Figure Baby Daddy',
    artist: 'Ooh Chile-ay',
    label: 'Capitol Records',
    duration: '0:30',
    bpm: 140,
    bars: 8,
  },
  {
    id: 'video5',
    videoUrl: '/videos/video5.mp4',
    title: 'Beat It',
    artist: '$PILLION',
    label: 'Universal Republic',
    duration: '0:30',
    bpm: 140,
    bars: 8,
  },
  {
    id: 'video6',
    videoUrl: '/videos/video6.mp4',
    title: 'SACKRITE',
    artist: 'RIPSkreet',
    label: 'BlackAImigo Records',
    duration: '0:30',
    bpm: 140,
    bars: 8,
  },
  {
    id: 'video7',
    videoUrl: '/videos/video7.mp4',
    title: 'Easily AI Approach',
    artist: 'ShawtAI Lo',
    label: 'D4L AIsylum Records',
    duration: '0:30',
    bpm: 140,
    bars: 8,
  },
  // Add more videos here when ready
];

export function VideoGallery() {
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const videos = placeholderVideos.length > 0 ? placeholderVideos : [];
  const { showModal } = useSignupModal();

  // Fetch play counts on mount
  useEffect(() => {
    const fetchPlayCounts = async () => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.vannilli.xaino.io';
      const counts: Record<string, number> = {};

      for (const video of videos) {
        try {
          // video.id now matches database format (video2, video3, etc.)
          const response = await fetch(`${apiUrl}/api/video-play-count/${video.id}`);
          if (response.ok) {
            const data = await response.json();
            counts[video.id] = data.displayCount || 12347;
          }
        } catch (error) {
          // Fallback to default count if API fails
          // Use varied counts matching database (1 std dev variation)
          const variations: Record<string, number> = {
            'video2': 12347,  // Mean (base)
            'video3': 12547,  // +200 (+1 std dev)
            'video4': 12147,  // -200 (-1 std dev)
            'video5': 12447,  // +100 (+0.5 std dev)
            'video6': 12247,  // -100 (-0.5 std dev)
            'video7': 12647,  // +300 (+1.5 std dev)
          };
          counts[video.id] = variations[video.id] || 12347;
        }
      }

      setPlayCounts(counts);
    };

    if (videos.length > 0) {
      fetchPlayCounts();
    }
  }, [videos]);

  // Track video play
  const trackVideoPlay = async (videoId: string, videoUrl: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.vannilli.xaino.io';

    try {
      // videoId now matches database format (video2, video3, etc.)
      const response = await fetch(`${apiUrl}/api/track-video-play`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId: videoId, // Already in correct format
          videoUrl,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setPlayCounts((prev) => ({
          ...prev,
          [videoId]: data.displayCount,
        }));
      }
    } catch (error) {
      // Silently fail - don't block video playback
      console.error('Failed to track video play:', error);
    }
  };


  // Create infinite scroll by duplicating videos multiple times
  // We'll create 3 copies for seamless looping
  const infiniteVideos = videos.length > 0 ? [...videos, ...videos, ...videos] : [];
  // Calculate width: 280px per video + 24px gap (gap-6 = 1.5rem = 24px)
  // Last video doesn't have gap, so: (videos.length - 1) * 24 + videos.length * 280
  const singleSetWidth = videos.length > 0 
    ? (videos.length - 1) * 24 + videos.length * 280 
    : 0;

  // Handle infinite scroll - reset position when near the end
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || videos.length === 0) return;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      
      // When user scrolls past 2/3 of the content (second set of videos),
      // seamlessly reset to the beginning of the second set
      // This creates the illusion of infinite scroll
      if (scrollLeft >= singleSetWidth * 1.5) {
        // Reset to the start of the second set (appears seamless)
        container.scrollLeft = scrollLeft - singleSetWidth;
      } else if (scrollLeft <= 0) {
        // If user scrolls back to the very beginning, jump to the start of the second set
        container.scrollLeft = singleSetWidth;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    
    // Initialize scroll position to the middle set (second copy) for seamless scrolling in both directions
    if (container.scrollLeft === 0) {
      container.scrollLeft = singleSetWidth;
    }

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [videos.length, singleSetWidth]);

  const handlePreLaunchLink = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    showModal();
  };

  return (
    <div className="w-full">
      {videos.length === 0 ? (
        // Empty state - ready for your videos (9:16 portrait for TikTok/social media)
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="group relative aspect-[9/16] bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden hover:border-slate-700 transition-all cursor-pointer"
            >
              {/* Placeholder thumbnail container - 9:16 portrait for TikTok */}
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-950">
                <div className="text-center">
                  <div className="text-4xl mb-2 opacity-30">🎬</div>
                  <div className="text-sm text-slate-600">Video {index + 1}</div>
                </div>
              </div>
              
              {/* Play overlay on hover */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-white ml-1"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>

              {/* Video info overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/70 to-transparent">
                <div className="text-white font-semibold text-sm mb-1">
                  Video Title {index + 1}
                </div>
                <div className="text-slate-400 text-xs flex items-center gap-2">
                  <span>Artist Name</span>
                  <span>•</span>
                  <span>0:14</span>
                </div>
              </div>

              {/* Vannilli Logo Badge */}
              <div className="absolute top-3 right-3 pointer-events-none z-10">
                <Image
                  src="/logo/logo.png"
                  alt="Vannilli"
                  width={200}
                  height={32}
                  className="w-auto h-8"
                  style={{
                    width: 'auto',
                    height: '32px',
                    objectFit: 'contain',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Horizontal scroll container for videos (9:16 portrait for TikTok/social media)
        <div 
          ref={scrollContainerRef}
          className="video-gallery-scroll overflow-x-auto overflow-y-visible pb-4 -mx-6 px-6 snap-x snap-mandatory"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#475569 #0f172a',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div className="flex gap-6" style={{ width: 'max-content' }}>
            {infiniteVideos.map((video, index) => {
              // Create unique IDs for duplicated videos
              const uniqueId = `${video.id}-${Math.floor(index / videos.length)}`;
              const isPlaying = playingVideoId === uniqueId;
            return (
              <div
                key={uniqueId}
                id={`video-container-${uniqueId}`}
                className="group relative aspect-[9/16] bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden hover:border-purple-500/50 transition-all flex-shrink-0 snap-start"
                style={{ width: '280px' }}
              >
                {/* Video player - inline */}
                <video
                  id={`video-${uniqueId}`}
                  src={video.videoUrl}
                  className={`w-full h-full object-cover ${isPlaying ? 'pointer-events-auto' : 'pointer-events-none'}`}
                  controls={isPlaying}
                  controlsList="nodownload"
                  playsInline
                  preload="none"
                  muted={!isPlaying}
                  onPlay={(e) => {
                    setPlayingVideoId(uniqueId);
                    trackVideoPlay(video.id, video.videoUrl);
                    const videoEl = e.currentTarget;
                    const container = document.getElementById(`video-container-${uniqueId}`);
                    if (videoEl) videoEl.style.pointerEvents = 'auto';
                    if (container && videoEl?.requestFullscreen) {
                      const c = container as FullscreenElement;
                      videoEl.requestFullscreen = () =>
                        (c.requestFullscreen || c.webkitRequestFullscreen || c.mozRequestFullScreen || c.msRequestFullscreen)?.call(c) ?? Promise.reject(new Error('Fullscreen not supported'));
                    }
                  }}
                  onPause={() => {
                    if (playingVideoId === uniqueId) {
                      setPlayingVideoId(null);
                      const v = document.getElementById(`video-${uniqueId}`) as HTMLVideoElement | null;
                      if (v) v.style.pointerEvents = 'none';
                    }
                  }}
                />

                {/* Custom Play Button Overlay - Center */}
                {!isPlaying && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const videoElement = document.getElementById(`video-${uniqueId}`) as HTMLVideoElement;
                      if (videoElement) {
                        // Pause all other videos
                        document.querySelectorAll('video').forEach((v) => {
                          if (v !== videoElement) {
                            v.pause();
                            v.currentTime = 0;
                          }
                        });
                        // Unmute and enable pointer events on video when playing
                        videoElement.muted = false;
                        videoElement.style.pointerEvents = 'auto';
                        videoElement.play().then(() => {
                          setPlayingVideoId(uniqueId);
                          // Track video play
                          trackVideoPlay(video.id, video.videoUrl);
                        }).catch((err) => {
                          // eslint-disable-next-line no-console
                          console.error('Error playing video:', err);
                        });
                      }
                    }}
                    className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors cursor-pointer z-20 group"
                    aria-label="Play video"
                    type="button"
                  >
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/90 hover:bg-white group-hover:scale-110 rounded-full flex items-center justify-center transition-all shadow-lg pointer-events-auto">
                      <svg
                        className="w-8 h-8 sm:w-10 sm:h-10 text-slate-950 ml-1"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </button>
                )}

                {/* Video info overlay - shows when not playing, positioned to not cover controls */}
                {!isPlaying && (
                  <div className="absolute bottom-0 left-0 right-0 p-3 pb-16 bg-gradient-to-t from-black/90 via-black/70 to-transparent pointer-events-none z-0">
                    <div className="text-white font-semibold text-sm mb-1">
                      {video.title}
                    </div>
                    <div className="text-slate-400 text-xs flex items-center gap-2 flex-wrap">
                      <span>{video.artist}</span>
                      {video.label && (
                        <>
                          <span>•</span>
                          <span>{video.label}</span>
                        </>
                      )}
                    </div>
                    {/* Play count for network effect */}
                    <div className="text-slate-500 text-xs mt-1">
                      {playCounts[video.id]?.toLocaleString() || '12,347'} plays
                    </div>
                  </div>
                )}

                {/* Vannilli Logo Badge - Always visible, even in fullscreen */}
                <div 
                  className="vannilli-logo-fullscreen absolute top-3 right-3 pointer-events-none z-10"
                  style={{
                    // Ensure logo stays visible in fullscreen
                    position: 'absolute',
                    zIndex: 9999,
                  }}
                >
                  <Image
                    src="/logo/logo.png"
                    alt="Vannilli"
                    width={200}
                    height={32}
                    className="w-auto h-8"
                    style={{
                      width: 'auto',
                      height: '32px',
                      objectFit: 'contain',
                    }}
                  />
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}


      {/* Instructions for adding videos */}
      {videos.length === 0 && (
        <div className="mt-12 text-center">
          <div className="inline-block bg-slate-900/50 backdrop-blur-sm rounded-xl p-8 border border-slate-800 max-w-2xl">
            <div className="text-5xl mb-4">🎬</div>
            <h3 className="text-xl font-bold text-white mb-3">
              Ready to Showcase Your Videos?
            </h3>
            <p className="text-slate-400 mb-4">
              Upload your generated videos with talking movements to display them here.
            </p>
            <div className="bg-slate-950 rounded-lg p-4 text-left text-sm text-slate-400 space-y-2">
              <p><span className="text-purple-400 font-semibold">1.</span> Add videos to <code className="px-2 py-1 bg-slate-800 rounded">/public/videos/</code> (9:16 portrait ratio for TikTok)</p>
              <p><span className="text-purple-400 font-semibold">2.</span> Create thumbnails (JPG/PNG) for each video (9:16 portrait ratio)</p>
              <p><span className="text-purple-400 font-semibold">3.</span> Update <code className="px-2 py-1 bg-slate-800 rounded">VideoGallery.tsx</code> with your video data</p>
            </div>
            <a
              href="#"
              onClick={handlePreLaunchLink}
              className="inline-block mt-6 px-6 py-3.5 sm:py-3 bg-white text-slate-950 text-sm sm:text-base font-semibold rounded-lg hover:bg-slate-100 transition-all min-h-[48px] flex items-center justify-center cursor-pointer"
            >
              Create Your First Video →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
