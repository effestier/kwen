'use client';

import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface MediaPickerProps {
  onMediaSelected: (file: File, previewUrl: string, type: 'image' | 'video') => void;
  onCancel: () => void;
}

export function MediaPicker({ onMediaSelected, onCancel }: MediaPickerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      alert('Please select an image or video file');
      return;
    }

    const type = file.type.startsWith('video/') ? 'video' : 'image';
    const previewUrl = URL.createObjectURL(file);

    setPreview(previewUrl);
    setTimeout(() => {
      onMediaSelected(file, previewUrl, type);
    }, 500);
  }, [onMediaSelected]);

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

    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleCameraCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });

      // For simplicity, just open file picker
      // In production, would build custom camera UI
      stream.getTracks().forEach(track => track.stop());
      fileInputRef.current?.click();
    } catch (err) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <button onClick={onCancel} className="text-white hover:text-[var(--text-muted)]">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
        <h1 className="text-white font-semibold">Create Story</h1>
        <div className="w-10" />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'w-full max-w-md aspect-[9/16] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors',
            isDragging
              ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10'
              : 'border-[var(--border-subtle)] hover:border-[var(--border-soft)]'
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          {preview ? (
            <video src={preview} className="w-full h-full object-cover rounded-2xl" />
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]">
                  <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                  <path d="M12 12v9" /><path d="m16 16-4-4-4 4" />
                </svg>
              </div>
              <p className="text-white font-medium mb-1">Tap to upload</p>
              <p className="text-[var(--text-muted)] text-sm">or drag and drop</p>
            </>
          )}
        </div>

        {/* Camera button */}
        <button
          onClick={handleCameraCapture}
          className="mt-6 px-6 py-3 rounded-full bg-[var(--bg-secondary)] text-white font-medium flex items-center gap-2 hover:bg-[var(--bg-tertiary)] transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
          Open camera
        </button>

        {/* File types info */}
        <p className="mt-4 text-[var(--text-muted)] text-sm">
          Supports: JPG, PNG, GIF, WebP, MP4, MOV
        </p>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}