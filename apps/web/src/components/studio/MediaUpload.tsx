'use client';

import { useState, useRef } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';

const VIDEO_MAX_SECONDS = 9;

function validateVideoDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(vid.duration);
    };
    vid.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load video'));
    };
    vid.src = url;
  });
}

interface MediaUploadProps {
  type: 'video' | 'image' | 'audio';
  label: string;
  description: string;
  accept: string;
  onFileSelect: (file: File) => void;
  /** For video/audio: called with duration in seconds when metadata is loaded. */
  onDuration?: (seconds: number) => void;
  preview?: string | null;
  icon: React.ReactNode;
}

export function MediaUpload({
  type,
  label,
  description,
  accept,
  onFileSelect,
  onDuration,
  preview,
  icon,
}: MediaUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [validatingVideo, setValidatingVideo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processVideo = (file: File) => {
    setVideoError(null);
    setValidatingVideo(true);
    validateVideoDuration(file)
      .then((d) => {
        setValidatingVideo(false);
        if (d > VIDEO_MAX_SECONDS) {
          setVideoError(`Video must be ${VIDEO_MAX_SECONDS} seconds or less (yours is ${d.toFixed(1)}s).`);
          clearFileInput();
          return;
        }
        onFileSelect(file);
        onDuration?.(d);
      })
      .catch(() => {
        setValidatingVideo(false);
        setVideoError('Could not read video. Try a different file.');
        clearFileInput();
      });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      if (type === 'video') {
        processVideo(files[0]);
      } else {
        onFileSelect(files[0]);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      if (type === 'video') {
        processVideo(files[0]);
      } else {
        onFileSelect(files[0]);
      }
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <GlassCard elevated className="relative overflow-hidden">
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-purple-400">{icon}</div>
          <h3 className="text-lg font-semibold text-white">{label}</h3>
        </div>
        <p className="text-sm text-slate-400">{description}</p>
      </div>

      {/* Upload Area */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all
          ${isDragging 
            ? 'border-purple-500 bg-purple-500/10' 
            : 'border-slate-700 hover:border-purple-500/50 bg-slate-900/30'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Preview */}
        {preview ? (
          <div className="space-y-4">
            {type === 'video' && (
              <video
                src={preview}
                controls
                className="w-full rounded-lg bg-black"
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration;
                  if (typeof d === 'number' && !Number.isNaN(d)) onDuration?.(d);
                }}
              />
            )}
            {type === 'image' && (
              <img
                src={preview}
                alt="Preview"
                className="w-full h-64 object-cover rounded-lg"
              />
            )}
            {type === 'audio' && (
              <div className="space-y-3">
                <audio
                  src={preview}
                  controls
                  className="w-full"
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    if (typeof d === 'number' && !Number.isNaN(d)) onDuration?.(d);
                  }}
                />
                <div className="flex items-center gap-2 text-green-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm">Audio file loaded</span>
                </div>
              </div>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="w-full px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded-lg transition-colors text-sm"
            >
              Change File
            </button>
          </div>
        ) : (
          // Upload Prompt
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-purple-500/10 rounded-full">
                <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
            </div>
            <p className="text-white font-medium mb-1">
              Click to upload or drag and drop
            </p>
            <p className="text-sm text-slate-400">
              {type === 'video' && 'MP4, MOV, or WebM (3–9s, max 500MB)'}
              {type === 'image' && 'JPG, PNG, or WebP (max 10MB)'}
              {type === 'audio' && 'WAV only (max 50MB)'}
            </p>
          </div>
        )}

        {/* Video duration validation message */}
        {type === 'video' && (videoError || validatingVideo) && (
          <div className="mt-3 text-center">
            {validatingVideo && <p className="text-sm text-slate-400">Checking duration…</p>}
            {videoError && <p className="text-sm text-red-400">{videoError}</p>}
          </div>
        )}

        {/* Drag Overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-purple-500/20 backdrop-blur-sm flex items-center justify-center rounded-xl">
            <div className="text-center">
              <svg className="w-12 h-12 text-purple-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-white font-semibold">Drop file here</p>
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
