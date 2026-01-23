'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useSignupModal } from '@/hooks/useSignupModal';

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
}

// Placeholder data - replace with your actual videos
const placeholderVideos: Video[] = [
  {
    id: '1',
    videoUrl: '/videos/video2.mov',
    title: 'NCLECTA',
    artist: 'ReCe',
    label: 'Atlantic Records',
    duration: '0:30',
    bpm: 140,
    bars: 8,
  },
  {
    id: '2',
    videoUrl: '/videos/video3.mov',
    title: 'Textin\' Us Bae',
    artist: 'Rezzumai',
    label: 'Universal Records',
    duration: '0:30',
    bpm: 140,
    bars: 8,
  },
  {
    id: '3',
    videoUrl: '/videos/video4.mov',
    title: '8-Figure Baby Daddy',
    artist: 'Ooh Chile-ay',
    label: 'Capitol Records',
    duration: '0:30',
    bpm: 140,
    bars: 8,
  },
  {
    id: '4',
    videoUrl: '/videos/video5.mov',
    title: 'Beat It',
    artist: '$PILLION',
    label: 'Universal Republic',
    duration: '0:30',
    bpm: 140,
    bars: 8,
  },
  // Add more videos here when ready
];

export function VideoGallery() {
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const videos = placeholderVideos.length > 0 ? placeholderVideos : [];
  const { showModal } = useSignupModal();

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
        // Video grid when videos are uploaded (9:16 portrait for TikTok/social media)
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {videos.map((video) => {
            const isPlaying = playingVideoId === video.id;
            return (
              <div
                key={video.id}
                className="group relative aspect-[9/16] bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden hover:border-purple-500/50 transition-all"
              >
                {/* Video player - inline */}
                <video
                  src={video.videoUrl}
                  className="w-full h-full object-cover"
                  controls
                  playsInline
                  preload="metadata"
                  muted={!isPlaying}
                  onClick={(e) => {
                    e.stopPropagation();
                    const videoElement = e.currentTarget;
                    if (isPlaying) {
                      videoElement.pause();
                      setPlayingVideoId(null);
                    } else {
                      // Pause all other videos
                      document.querySelectorAll('video').forEach((v) => {
                        if (v !== videoElement) {
                          v.pause();
                          v.currentTime = 0;
                        }
                      });
                      videoElement.play();
                      setPlayingVideoId(video.id);
                    }
                  }}
                  onPlay={() => setPlayingVideoId(video.id)}
                  onPause={() => {
                    if (playingVideoId === video.id) {
                      setPlayingVideoId(null);
                    }
                  }}
                />

                {/* Video info overlay - shows when not playing, positioned to not cover controls */}
                {!isPlaying && (
                  <div className="absolute bottom-0 left-0 right-0 p-3 pb-16 bg-gradient-to-t from-black/90 via-black/70 to-transparent pointer-events-none">
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
                  </div>
                )}

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
            );
          })}
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
