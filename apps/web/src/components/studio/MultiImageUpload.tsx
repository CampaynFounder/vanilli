'use client';

import { useState, useRef } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';

interface MultiImageUploadProps {
  label: string;
  description: string;
  maxImages: number;
  onImagesSelect: (files: File[]) => void;
  previews?: string[];
  icon: React.ReactNode;
}

export function MultiImageUpload({
  label,
  description,
  maxImages,
  onImagesSelect,
  previews = [],
  icon,
}: MultiImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const imageFiles: File[] = [];
    for (let i = 0; i < Math.min(files.length, maxImages); i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        imageFiles.push(file);
      }
    }

    if (imageFiles.length > maxImages) {
      alert(`Maximum ${maxImages} images allowed. Only the first ${maxImages} will be used.`);
      onImagesSelect(imageFiles.slice(0, maxImages));
    } else {
      onImagesSelect(imageFiles);
    }
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
    handleFiles(e.dataTransfer.files);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const removeImage = (_index: number) => {
    // Note: This only removes from previews. Parent component should handle file removal.
    // For now, we'll trigger a re-upload flow.
    onImagesSelect([]);
  };

  return (
    <GlassCard elevated className="relative overflow-hidden">
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-purple-400">{icon}</div>
          <h3 className="text-lg font-semibold text-white">{label}</h3>
        </div>
        <p className="text-sm text-slate-400">{description}</p>
        {maxImages > 1 && (
          <p className="text-xs text-slate-500 mt-1">
            Upload up to {maxImages} images (will cycle through chunks)
          </p>
        )}
      </div>

      {/* Upload Area */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all
          ${isDragging 
            ? 'border-purple-500 bg-purple-500/10' 
            : 'border-slate-700 hover:border-purple-500/50 bg-slate-900/30'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          multiple={maxImages > 1}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Preview Grid */}
        {previews.length > 0 ? (
          <div className="space-y-4">
            <div className={`grid gap-3 ${maxImages === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3'}`}>
              {previews.map((preview, index) => (
                <div key={index} className="relative group">
                  <img
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-32 sm:h-40 object-cover rounded-lg bg-black/40"
                  />
                  {maxImages > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage(index);
                      }}
                      className="absolute top-2 right-2 p-1 bg-red-600/80 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded text-xs text-white">
                    {index + 1}
                  </div>
                </div>
              ))}
            </div>
            {previews.length < maxImages && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="w-full px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded-lg transition-colors text-sm"
              >
                Add More Images ({previews.length}/{maxImages})
              </button>
            )}
          </div>
        ) : (
          // Upload Prompt
          <div className="text-center py-8">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-purple-500/10 rounded-full">
                <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <p className="text-white font-medium mb-1">
              Click to upload or drag and drop
            </p>
            <p className="text-sm text-slate-400">
              JPG, PNG, or WebP (max {maxImages} {maxImages === 1 ? 'image' : 'images'}, 10MB each)
            </p>
          </div>
        )}

        {/* Drag Overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-purple-500/20 backdrop-blur-sm flex items-center justify-center rounded-xl">
            <div className="text-center">
              <svg className="w-12 h-12 text-purple-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-white font-semibold">Drop images here</p>
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
