'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface VoiceMessageProps {
  mediaUrl: string;
  duration: number; // seconds
  isMine: boolean;
  onRefreshUrl?: () => Promise<string | null>;
}

// Global audio manager — only one voice plays at a time
let currentAudio: HTMLAudioElement | null = null;
let currentStopFn: (() => void) | null = null;

function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if (currentStopFn) {
    currentStopFn();
    currentStopFn = null;
  }
}

export function VoiceMessage({ mediaUrl, duration, isMine, onRefreshUrl }: VoiceMessageProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [currentUrl, setCurrentUrl] = useState(mediaUrl);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMountedRef = useRef(true);

  const stopThis = useCallback(() => {
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
  }, []);

  const togglePlay = useCallback(async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    // Stop any other playing audio
    stopCurrentAudio();

    let url = currentUrl;
    // Try to create audio element — if URL expired, refresh
    if (!audioRef.current) {
      const audio = new Audio(url);
      audio.playbackRate = speed;

      audio.ontimeupdate = () => {
        if (isMountedRef.current && audio.duration) {
          const pct = (audio.currentTime / audio.duration) * 100;
          setProgress(pct);
          setCurrentTime(Math.floor(audio.currentTime));
        }
      };

      audio.onended = () => {
        if (isMountedRef.current) {
          setIsPlaying(false);
          setProgress(0);
          setCurrentTime(0);
        }
      };

      audio.onerror = async () => {
        // URL may have expired — try refresh
        if (onRefreshUrl) {
          const fresh = await onRefreshUrl();
          if (fresh && isMountedRef.current) {
            setCurrentUrl(fresh);
            audio.src = fresh;
            audio.play().catch(() => {});
            return;
          }
        }
        if (isMountedRef.current) setIsPlaying(false);
      };

      audioRef.current = audio;
      currentAudio = audio;
      currentStopFn = stopThis;
    }

    try {
      audioRef.current.playbackRate = speed;
      await audioRef.current.play();
      if (isMountedRef.current) setIsPlaying(true);
    } catch {
      // Try refreshing URL on play failure
      if (onRefreshUrl) {
        const fresh = await onRefreshUrl();
        if (fresh && audioRef.current && isMountedRef.current) {
          setCurrentUrl(fresh);
          audioRef.current.src = fresh;
          audioRef.current.play().catch(() => {});
        }
      }
    }
  }, [isPlaying, currentUrl, speed, onRefreshUrl, stopThis]);

  // Scrub: tap on waveform to seek
  const handleWaveformClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    if (audioRef.current && audioRef.current.duration) {
      audioRef.current.currentTime = pct * audioRef.current.duration;
      setProgress(pct * 100);
      setCurrentTime(Math.floor(pct * audioRef.current.duration));
    }
  }, []);

  // Cycle playback speed
  const cycleSpeed = useCallback(() => {
    const speeds = [1, 1.5, 2];
    const idx = speeds.indexOf(speed);
    const next = speeds[(idx + 1) % speeds.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, [speed]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (audioRef.current) {
        audioRef.current.pause();
        if (currentAudio === audioRef.current) {
          currentAudio = null;
          currentStopFn = null;
        }
        audioRef.current = null;
      }
    };
  }, []);

  // Update URL if prop changes
  useEffect(() => {
    setCurrentUrl(mediaUrl);
  }, [mediaUrl]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const bars = 30;

  return (
    <div className="min-w-[200px] max-w-[260px]">
      {/* Time + speed — outside/before the message content */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn(
          'text-[11px] font-medium',
          isMine ? 'text-white/70' : 'text-[var(--text-muted)]'
        )}>
          {isPlaying ? formatTime(currentTime) : formatTime(duration)}
        </span>
        <button
          onClick={cycleSpeed}
          className={cn(
            'text-[10px] font-semibold px-2 py-1 rounded-md min-w-[32px] text-center active:scale-90 transition-transform',
            isMine ? 'bg-white/20 text-white/70' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
          )}
        >
          {speed}x
        </button>
      </div>

      {/* Play + waveform */}
      <div className="flex items-center gap-2">
        <button
          onClick={togglePlay}
          className={cn(
            'w-10 h-10 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform',
            isMine ? 'bg-white/20' : 'bg-[var(--bg-tertiary)]'
          )}
          aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
        >
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="m5 3 14 9-14 9V3Z" />
            </svg>
          )}
        </button>

        <div
          className="flex-1 flex items-center gap-[1px] h-8 cursor-pointer"
          onClick={handleWaveformClick}
          role="slider"
          aria-label="Seek voice message"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
        >
          {Array.from({ length: bars }).map((_, i) => {
            const pct = (i / bars) * 100;
            const isActive = pct <= progress;
            // Deterministic pseudo-random height based on index for a natural waveform
            const seed = (i * 2654435761) >>> 0;
            const raw = ((seed % 100) / 100);
            const height = 4 + raw * 20;
            return (
              <div
                key={i}
                className={cn(
                  'flex-1 rounded-full transition-colors duration-100',
                  isActive
                    ? (isMine ? 'bg-white' : 'bg-[var(--text-primary)]')
                    : (isMine ? 'bg-white/30' : 'bg-[var(--text-muted)]/30')
                )}
                style={{ height: `${Math.max(4, height)}px` }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
