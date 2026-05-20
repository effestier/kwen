'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface MediaPickerProps {
  onMediaSelected: (file: File, previewUrl: string, type: 'image' | 'video') => void;
  onCancel: () => void;
}

export function MediaPicker({ onMediaSelected, onCancel }: MediaPickerProps) {
  const [mode, setMode] = useState<'camera' | 'gallery'>('camera');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isRecording, setIsRecording] = useState(false);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true,
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      // Camera not available, fall back to gallery
      setMode('gallery');
    }
  }, [facingMode]);

  useEffect(() => {
    if (mode === 'camera') {
      startCamera();
    }
    return () => {
      cameraStream?.getTracks().forEach(t => t.stop());
    };
  }, [mode, facingMode]);

  // Capture photo
  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], 'story-photo.jpg', { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      onMediaSelected(file, url, 'image');
    }, 'image/jpeg', 0.9);
  }, [onMediaSelected]);

  // Record video
  const startRecording = useCallback(() => {
    if (!cameraStream) return;
    setIsRecording(true);
    chunksRef.current = [];

    const recorder = new MediaRecorder(cameraStream, { mimeType: 'video/webm' });
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const file = new File([blob], 'story-video.webm', { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      onMediaSelected(file, url, 'video');
      setIsRecording(false);
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
  }, [cameraStream, onMediaSelected]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  // Toggle camera
  const toggleCamera = useCallback(() => {
    cameraStream?.getTracks().forEach(t => t.stop());
    setFacingMode(f => f === 'user' ? 'environment' : 'user');
  }, [cameraStream]);

  // Handle gallery file select
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // If selecting a single file, use it directly
    const file = files[0];
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    const url = URL.createObjectURL(file);
    onMediaSelected(file, url, type);
  }, [onMediaSelected]);

  // Long press for video, tap for photo
  const handlePointerDown = useCallback(() => {
    longPressTimerRef.current = setTimeout(() => {
      startRecording();
    }, 500);
  }, [startRecording]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (isRecording) {
      stopRecording();
    } else {
      capturePhoto();
    }
  }, [isRecording, capturePhoto, stopRecording]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 relative z-10">
        <button onClick={onCancel} className="text-white p-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
        <div className="flex gap-1 bg-white/10 rounded-full p-0.5">
          {(['Story', 'Reel', 'Post'] as const).map((tab) => (
            <button
              key={tab}
              className={cn(
                'px-4 py-1.5 rounded-full text-xs font-semibold transition-colors',
                tab === 'Story' ? 'bg-white text-black' : 'text-white/60'
              )}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="w-10" />
      </div>

      {/* Camera / Gallery */}
      {mode === 'camera' ? (
        <div className="flex-1 relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Camera controls */}
          <div className="absolute bottom-0 left-0 right-0 p-6 flex items-center justify-between">
            {/* Gallery */}
            <button
              onClick={() => setMode('gallery')}
              className="w-10 h-10 rounded-lg border-2 border-white/50 overflow-hidden"
            >
              <div className="w-full h-full bg-white/20" />
            </button>

            {/* Capture */}
            <button
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerLeave={() => {
                if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
              }}
              className="relative"
            >
              <div className={cn(
                'w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all',
                isRecording ? 'scale-110' : ''
              )}>
                <div className={cn(
                  'rounded-full transition-all',
                  isRecording ? 'w-8 h-8 bg-red-500 rounded-lg' : 'w-16 h-16 bg-white'
                )} />
              </div>
              {isRecording && (
                <div className="absolute inset-0 rounded-full border-4 border-red-500 animate-ping" />
              )}
            </button>

            {/* Flip camera */}
            <button onClick={toggleCamera} className="w-10 h-10 flex items-center justify-center text-white">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" /><path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
                <path d="m16 3-4 4 4 4" /><path d="m8 21 4-4-4-4" />
              </svg>
            </button>
          </div>

          {/* Swipe up hint */}
          <div className="absolute bottom-28 left-0 right-0 text-center">
            <button
              onClick={() => setMode('gallery')}
              className="text-white/60 text-xs flex flex-col items-center gap-1 mx-auto"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m18 15-6-6-6 6" />
              </svg>
              Gallery
            </button>
          </div>
        </div>
      ) : (
        /* Gallery mode */
        <div className="flex-1 flex flex-col">
          <div className="flex-1 flex items-center justify-center p-8">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full max-w-sm aspect-[9/16] rounded-2xl border-2 border-dashed border-white/30 flex flex-col items-center justify-center cursor-pointer hover:border-white/60 transition-colors"
            >
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                  <path d="M12 12v9" /><path d="m16 16-4-4-4 4" />
                </svg>
              </div>
              <p className="text-white font-medium mb-1">Tap to select</p>
              <p className="text-white/50 text-sm">Photo or video</p>
            </div>
          </div>

          {/* Bottom controls */}
          <div className="p-6 flex items-center justify-between">
            <button onClick={onCancel} className="text-white/60 text-sm">
              Cancel
            </button>
            <button
              onClick={() => setMode('camera')}
              className="flex items-center gap-2 text-white text-sm"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              Camera
            </button>
          </div>
        </div>
      )}

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
