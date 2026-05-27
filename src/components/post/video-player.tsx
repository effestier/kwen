'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

interface VideoPlayerProps {
  src: string;
  className?: string;
  onDoubleTap?: () => void;
  active?: boolean; // H9: only autoplay when this slide is active in a carousel
}

export function VideoPlayer({ src, className, active = true }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // M21: Clean up overlay timer on unmount
  useEffect(() => {
    return () => {
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
    };
  }, []);

  // Viewport-aware autoplay — H9: only autoplay when active slide
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && active) {
          video.play().then(
            () => setIsPlaying(true),
            () => setIsPlaying(false) // H4: Sync state if play rejects
          );
        } else if (entry.intersectionRatio < 0.25 || !active) {
          video.pause();
          setIsPlaying(false);
        }
      },
      { threshold: [0.25, 0.5] }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [active]);

  const showPlayPauseOverlay = useCallback(() => {
    setShowOverlay(true);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => setShowOverlay(false), 500);
  }, []);

  const handleTogglePlay = useCallback((_e: React.MouseEvent) => {
    // H1/H6: Don't stopPropagation — let click bubble to carousel for double-tap detection
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().then(
        () => setIsPlaying(true),
        () => setIsPlaying(false) // H4: Sync state if play rejects
      );
    } else {
      video.pause();
      setIsPlaying(false);
    }
    showPlayPauseOverlay();
  }, [showPlayPauseOverlay]);

  const handleToggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full ${className || ''}`}
      onClick={handleTogglePlay}
    >
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-cover"
        playsInline
        muted={isMuted}
        preload="metadata"
        loop
      />

      {/* Mute toggle */}
      <button
        onClick={handleToggleMute}
        className="absolute bottom-3 right-3 p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white transition-opacity z-10"
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4V5Z" /><line x1="22" x2="16" y1="9" y2="15" /><line x1="16" x2="22" y1="9" y2="15" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )}
      </button>

      {/* Play/Pause overlay flash */}
      {showOverlay && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="p-3 rounded-full bg-black/40 backdrop-blur-sm animate-fadeIn">
            {isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="4" height="16" x="6" y="4" /><rect width="4" height="16" x="14" y="4" />
              </svg>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
