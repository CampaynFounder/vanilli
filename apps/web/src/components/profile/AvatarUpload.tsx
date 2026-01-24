'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';

interface AvatarUploadProps {
  currentAvatarUrl?: string;
  onAvatarUpdate: (url: string) => void;
  /** Required: used for storage path and must match auth.uid() for policies. */
  userId: string;
}

const BUCKET = 'vannilli';
const AVATARS_PREFIX = 'avatars';

export function AvatarUpload({ currentAvatarUrl, onAvatarUpdate, userId }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(currentAvatarUrl || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Only image files are allowed');
      return;
    }

    setUploading(true);

    try {
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);

      // Upload to Supabase Storage: vannilli/avatars/{userId}_{timestamp}.{ext}
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `${userId}_${Date.now()}.${fileExt}`;
      const filePath = `${AVATARS_PREFIX}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Public URL (requires storage policy: avatars_public_read on vannilli/avatars/*)
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
      const publicUrl = data.publicUrl;

      onAvatarUpdate(publicUrl);
      setPreviewUrl(publicUrl);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      alert('Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        {/* Avatar display with neumorphic inset effect */}
        <div className="neumorphic-inset w-32 h-32 rounded-full overflow-hidden flex items-center justify-center">
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt="Avatar"
              width={128}
              height={128}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white text-4xl font-bold">
              {/* Placeholder - first letter of email */}
              ?
            </div>
          )}
        </div>

        {/* Upload button overlay */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="absolute bottom-0 right-0 w-10 h-10 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 rounded-full flex items-center justify-center shadow-lg animate-glow-pulse transition-colors"
        >
          {uploading ? (
            <div className="spinner w-4 h-4 border-2" />
          ) : (
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      <p className="text-xs text-slate-400">Click to upload avatar (max 5MB)</p>
    </div>
  );
}
