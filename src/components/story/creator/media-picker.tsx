'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { hapticLight } from '@/lib/haptics';

interface MediaPickerProps {
  onMediaSelected: (file: File, previewUrl: string, type: 'image' | 'video') => void;
  onCancel: () => void;
}

export function MediaPicker({ onMediaSelected, onCancel }: MediaPickerProps) {
  const [mode, setMode] = useState<'camera' | 'gallery'>('camera');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [timerCountdown, setTimerCountdown] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Clipboard paste handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const url = URL.createObjectURL(file);
            onMediaSelected(file, url, 'image');
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [onMediaSelected]);

  // Flash/torch control
  const toggleFlash = useCallback(async () => {
    if (!cameraStream) return;
    const track = cameraStream.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities = track.getCapabilities();
      if ('torch' in capabilities) {
        await track.applyConstraints({
          advanced: [{ torch: !flashEnabled } as any],
        });
        setFlashEnabled(!flashEnabled);
      }
    } catch {
      // Flash not supported
    }
  }, [cameraStream, flashEnabled]);

  // L8: Timer countdown for capture — uses ref to avoid stale closure on capturePhoto
  const startTimer = useCallback((seconds: number) => {
    setTimerCountdown(seconds);
    hapticLight();

    timerIntervalRef.current = setInterval(() => {
      setTimerCountdown(prev => {
        if (prev === null || prev <= 1) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          setTimeout(() => {
            capturePhotoRef.current?.();
            setTimerCountdown(null);
          }, 100);
          return null;
        }
        hapticLight();
        return prev - 1;
      });
    }, 1000);
  }, []);

  // L8: Use ref to avoid stale closure capturing capturePhoto
  const capturePhotoRef = useRef<(() => void) | null>(null);

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
    }, 'image/jpeg', 0.92);
  }, [onMediaSelected]);

  // Keep ref in sync
  useEffect(() => { capturePhotoRef.current = capturePhoto; }, [capturePhoto]);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      setRecordingTime(0);
    }
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    };
  }, [isRecording]);

  // Record video
  const startRecording = useCallback(() => {
    if (!cameraStream) return;
    setIsRecording(true);
    chunksRef.current = [];

    // H39: Prefer MP4 on Android (WebM unsupported), fallback to WebM
    // H39: Prefer MP4 (Android-supported), fallback to WebM
    const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')
      ? 'video/mp4;codecs=avc1'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
    const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';

    const recorder = new MediaRecorder(cameraStream, { mimeType });
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const file = new File([blob], `story-video.${ext}`, { type: mimeType });
      const url = URL.createObjectURL(blob);
      onMediaSelected(file, url, 'video');
      setIsRecording(false);
    };

    mediaRecorderRef.current = recorder;
    recorder.start(100); // collect data every 100ms for smoother chunks
  }, [cameraStream, onMediaSelected]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  // Toggle camera
  const toggleCamera = useCallback(() => {
    cameraStream?.getTracks().forEach(t => t.stop());
    setFlashEnabled(false);
    setFacingMode(f => f === 'user' ? 'environment' : 'user');
  }, [cameraStream]);

  // Handle gallery file select
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const file = files[0];
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    const url = URL.createObjectURL(file);
    onMediaSelected(file, url, type);
  }, [onMediaSelected]);

  // Drag and drop handlers (desktop)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const mediaFile = files.find(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (mediaFile) {
      const type = mediaFile.type.startsWith('video/') ? 'video' : 'image';
      const url = URL.createObjectURL(mediaFile);
      onMediaSelected(mediaFile, url, type);
    }
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
    } else if (!timerCountdown) {
      capturePhoto();
    }
  }, [isRecording, capturePhoto, stopRecording, timerCountdown]);

  const formatRecordingTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black flex flex-col"
      style={{ height: '100dvh' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag-drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-black/80 border-2 border-dashed border-white/60 flex items-center justify-center">
          <div className="text-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" className="mx-auto mb-3 opacity-60">
              <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
              <path d="M12 12v9" /><path d="m16 16-4-4-4 4" />
            </svg>
            <p className="text-white text-lg font-medium">Drop image or video</p>
            <p className="text-white/50 text-sm mt-1">to create a story</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 relative z-10" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <button onClick={onCancel} className="text-white p-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
        <p className="text-white font-semibold text-sm">Story</p>
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

          {/* Timer countdown overlay */}
          {timerCountdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
              <span className="text-white text-8xl font-bold animate-pulse">{timerCountdown}</span>
            </div>
          )}

          {/* Recording indicator */}
          {isRecording && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 rounded-full px-4 py-2 z-10">
              <div className="w-3 h-3 rounded-full bg-[var(--accent-red)] animate-pulse" />
              <span className="text-white text-sm font-medium">{formatRecordingTime(recordingTime)}</span>
            </div>
          )}

          {/* Camera controls */}
          <div className="absolute bottom-0 left-0 right-0 p-6 flex items-center justify-between" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
            {/* Gallery */}
            <button
              onClick={() => setMode('gallery')}
              className="w-10 h-10 rounded-lg border-2 border-white/50 overflow-hidden flex items-center justify-center bg-white/10"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
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
                  'rounded-full transition-all duration-300',
                  isRecording ? 'w-8 h-8 bg-[var(--accent-red)]' : 'w-16 h-16 bg-white'
                )} />
              </div>
              {isRecording && (
                <div className="absolute inset-0 rounded-full border-4 border-red-500 animate-ping" />
              )}
            </button>

            {/* Right side controls */}
            <div className="flex flex-col gap-3">
              {/* Flip camera */}
              <button onClick={toggleCamera} className="w-10 h-10 flex items-center justify-center text-white">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" /><path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
                  <path d="m16 3-4 4 4 4" /><path d="m8 21 4-4-4-4" />
                </svg>
              </button>

              {/* Flash */}
              <button onClick={toggleFlash} className="w-10 h-10 flex items-center justify-center text-white">
                <svg width="24" height="24" viewBox="0 0 24 24" fill={flashEnabled ? 'white' : 'none'} stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </button>

              {/* Timer */}
              <button
                onClick={() => startTimer(3)}
                className="w-10 h-10 flex items-center justify-center text-white"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
              </button>
            </div>
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
              className="w-full max-w-[260px] flex flex-col items-center cursor-pointer group"
            >
              <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center mb-5 group-active:scale-95 transition-transform">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                </svg>
              </div>
              <p className="text-white text-base font-semibold mb-1">Select from gallery</p>
              <p className="text-white/40 text-sm">Photos & videos up to 15s</p>
              <div className="mt-6 px-6 py-2.5 rounded-full bg-white text-black text-sm font-semibold active:scale-95 transition-transform">
                Choose media
              </div>
              <p className="text-white/25 text-xs mt-4">or paste from clipboard</p>
            </div>
          </div>

          {/* Bottom controls */}
          <div className="p-6 flex items-center justify-between" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
            <button onClick={onCancel} className="text-white/60 text-sm active:opacity-50">
              Cancel
            </button>
            <button
              onClick={() => setMode('camera')}
              className="flex items-center gap-2 text-white text-sm active:opacity-70"
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
