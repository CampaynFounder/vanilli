'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface ProcessingThumbnailProps {
  targetImages?: string[];
  thumbnailPath?: string | null;
  progress: number;
  currentStage?: string | null;
}

export function ProcessingThumbnail({ 
  targetImages, 
  thumbnailPath, 
  progress, 
  currentStage 
}: ProcessingThumbnailProps) {
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // Map stage to user-friendly message
  const getStageMessage = (stage: string | null | undefined): string => {
    switch (stage) {
      case 'analyzing':
        return 'Analyzing media...';
      case 'processing_chunks':
        return 'Creating scenes...';
      case 'stitching':
        return 'Finalizing scenes...';
      case 'finalizing':
        return 'Finalizing video...';
      default:
        return 'Processing...';
    }
  };

  useEffect(() => {
    const loadImages = async () => {
      const urls: string[] = [];
      
      // Try target_images first (user-provided images)
      if (targetImages && targetImages.length > 0) {
        for (const imgUrl of targetImages.slice(0, 3)) { // Limit to 3 for display
          try {
            // If it's already a full URL, use it directly
            if (imgUrl.startsWith('http')) {
              urls.push(imgUrl);
            } else {
              // Otherwise, create signed URL
              const { data, error } = await supabase.storage.from('vannilli').createSignedUrl(imgUrl, 3600);
              if (!error && data?.signedUrl) {
                urls.push(data.signedUrl);
              }
            }
          } catch (e) {
            // Skip failed images
          }
        }
      }
      
      // Fallback to thumbnail if no target images
      if (urls.length === 0 && thumbnailPath) {
        try {
          const { data, error } = await supabase.storage.from('vannilli').createSignedUrl(thumbnailPath, 3600);
          if (!error && data?.signedUrl) {
            urls.push(data.signedUrl);
          }
        } catch (e) {
          // Skip if fails
        }
      }
      
      setImageUrls(urls);
    };
    
    loadImages();
  }, [targetImages, thumbnailPath]);

  // Rotate through images if multiple
  useEffect(() => {
    if (imageUrls.length > 1) {
      const interval = setInterval(() => {
        setCurrentImageIndex((prev) => (prev + 1) % imageUrls.length);
      }, 2000); // Change image every 2 seconds
      return () => clearInterval(interval);
    }
  }, [imageUrls.length]);

  const stageMessage = getStageMessage(currentStage);
  const displayImage = imageUrls[currentImageIndex] || null;

  return (
    <div className="w-full h-full relative overflow-hidden">
      {/* Background image(s) */}
      {displayImage ? (
        <img 
          src={displayImage}
          alt="Processing"
          className="w-full h-full object-cover opacity-60"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-purple-900/30 to-blue-900/30" />
      )}
      
      {/* Animated processing overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-blue-600/20 to-purple-600/20">
        {/* Animated scanning bar */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-scan" />
        
        {/* Progress indicator */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-900/50">
          <div 
            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
            style={{ width: `${Math.max(5, progress)}%` }}
          />
        </div>
        
        {/* Stage message and progress */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
          <div className="text-xs font-semibold mb-1 drop-shadow-lg">
            {stageMessage}
          </div>
          <div className="text-xs text-white/80 drop-shadow">
            {progress}%
          </div>
        </div>
        
        {/* Animated dots */}
        <div className="absolute top-2 right-2 flex gap-1">
          <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0s' }} />
          <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
          <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    </div>
  );
}
