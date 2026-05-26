'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { requestMicrophonePermission } from '@/lib/capacitor';

interface VoiceRecorderProps {
  onSend: (blob: Blob, duration: number) => void;
  onCancel: () => void;
}

export function VoiceRecorder({ onSend, onCancel }: VoiceRecorderProps) {
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.trace('[VOICE][MOUNT] VoiceRecorder rendered');
  }

  // Lifecycle states
  const [phase, setPhase] = useState<'initializing' | 'recording' | 'locked'>('initializing');
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(new Array(40).fill(0));
  const [slideCancelled, setSlideCancelled] = useState(false);
  const [isUnsupported, setIsUnsupported] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedAtRef = useRef<number>(0);
  const totalPausedMsRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const cancelledRef = useRef<boolean>(false);
  const sentRef = useRef<boolean>(false);
  const mimeTypeRef = useRef<string>('audio/webm');
  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    // eslint-disable-next-line no-console
    console.log('[VOICE] cleanup()');
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    analyserRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  // Single authoritative send
  const stopAndSend = useCallback(() => {
    // eslint-disable-next-line no-console
    console.log('[VOICE] stopAndSend()', { sentRef: sentRef.current, cancelledRef: cancelledRef.current, mediaRecorderState: mediaRecorderRef.current?.state });
    if (sentRef.current || cancelledRef.current) return;

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);

    const recorder = mediaRecorderRef.current;
    if (recorder && (recorder.state === 'recording' || recorder.state === 'paused')) {
      sentRef.current = true;
      recorder.stop();
    } else {
      sentRef.current = true;
      cleanup();
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      onSend(blob, durationRef.current);
    }
  }, [onSend, cleanup]);

  // Single authoritative cancel
  const doCancel = useCallback(() => {
    // eslint-disable-next-line no-console
    console.log('[VOICE] doCancel()', { sentRef: sentRef.current });
    if (sentRef.current) return;
    cancelledRef.current = true;

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);

    const recorder = mediaRecorderRef.current;
    if (recorder && (recorder.state === 'recording' || recorder.state === 'paused')) {
      recorder.ondataavailable = null;
      recorder.stop();
    }
    cleanup();
    onCancel();
  }, [onCancel, cleanup]);

  // Start recording — the ONLY async operation
  const startRecording = useCallback(async () => {
    // eslint-disable-next-line no-console
    console.log('[VOICE] startRecording() entry', { mediaRecorderDefined: typeof MediaRecorder !== 'undefined', hasGetUserMedia: !!navigator.mediaDevices?.getUserMedia });
    try {
      if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        // eslint-disable-next-line no-console
        console.warn('[VOICE] unsupported -> setIsUnsupported(true)');
        setIsUnsupported(true);
        return;
      }

      // Request microphone permission (handles native + web)
      // eslint-disable-next-line no-console
      console.log('[VOICE] requesting microphone permission...');
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        // eslint-disable-next-line no-console
        console.warn('[VOICE] permission denied');
        setPermissionDenied(true);
        return;
      }

      // eslint-disable-next-line no-console
      console.log('[VOICE] requesting getUserMedia...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // M42: If cancel fired while getUserMedia was pending, stop the stream immediately
      if (cancelledRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      // eslint-disable-next-line no-console
      console.log('[VOICE] getUserMedia success', { tracks: stream.getTracks().length });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/webm';
      mimeTypeRef.current = mimeType;

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        // eslint-disable-next-line no-console
        console.log('[VOICE] recorder.onstop', { cancelledRef: cancelledRef.current, chunks: chunksRef.current.length });
        stream.getTracks().forEach(t => t.stop());
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
          audioCtxRef.current.close().catch(() => {});
        }
        if (!cancelledRef.current) {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          onSend(blob, durationRef.current);
        }
      };

      mediaRecorderRef.current = recorder;
      // eslint-disable-next-line no-console
      console.log('[VOICE] MediaRecorder.start()');
      recorder.start(100);
      totalPausedMsRef.current = 0;
      pausedAtRef.current = 0;

      // ONLY NOW is the recorder ready — transition from initializing to recording
      // eslint-disable-next-line no-console
      console.log('[VOICE] phase -> recording');
      setPhase('recording');

      // Duration timer — M8: Auto-stop at 60 seconds (Instagram limit)
      const startTime = Date.now();
      const MAX_DURATION = 60;
      durationTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime - totalPausedMsRef.current;
        const d = Math.floor(elapsed / 1000);
        durationRef.current = d;
        setDuration(d);
        if (d >= MAX_DURATION) {
          stopAndSend();
        }
      }, 200);

      // Waveform animation
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateWaveform = () => {
        analyser.getByteFrequencyData(dataArray);
        const normalized = Array.from(dataArray.slice(0, 40)).map(v => v / 255);
        setWaveform(normalized);
        animFrameRef.current = requestAnimationFrame(updateWaveform);
      };
      animFrameRef.current = requestAnimationFrame(updateWaveform);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[VOICE] startRecording() failure', e);
      // If permission denied (NotAllowedError), show actionable UI instead of silently closing
      if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError')) {
        setPermissionDenied(true);
      } else {
        doCancel();
      }
    }
  }, [doCancel, onSend]);

  // Auto-start on mount
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[VOICE] useEffect mount -> startRecording()');
    startRecording();
    return () => {
      // eslint-disable-next-line no-console
      console.log('[VOICE][UNMOUNT] VoiceRecorder unmounting');
      cancelledRef.current = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      if (mediaRecorderRef.current?.state === 'recording' || mediaRecorderRef.current?.state === 'paused') {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.stop();
      }
      cleanup();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ARCHITECTURAL GUARD: only process touch events when recorder is active
  const isRecorderActive = phase === 'recording' || phase === 'locked';

  // Pause/resume
  const togglePause = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (recorder.state === 'recording') {
      recorder.pause();
      pausedAtRef.current = Date.now();
      setIsPaused(true);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    } else if (recorder.state === 'paused') {
      totalPausedMsRef.current += Date.now() - pausedAtRef.current;
      recorder.resume();
      setIsPaused(false);
      if (analyserRef.current) {
        const analyser = analyserRef.current;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateWaveform = () => {
          analyser.getByteFrequencyData(dataArray);
          const normalized = Array.from(dataArray.slice(0, 40)).map(v => v / 255);
          setWaveform(normalized);
          animFrameRef.current = requestAnimationFrame(updateWaveform);
        };
        animFrameRef.current = requestAnimationFrame(updateWaveform);
      }
    }
  }, []);

  // Touch handlers — slide left to cancel, slide up to lock
  // ALL guarded by isRecorderActive — no events processed during initializing phase
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // eslint-disable-next-line no-console
    console.log('[VOICE] touchstart', { isRecorderActive });
    if (!isRecorderActive) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  }, [isRecorderActive]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // eslint-disable-next-line no-console
    console.log('[VOICE] touchmove', { isRecorderActive });
    if (!isRecorderActive) return;
    const dx = touchStartXRef.current - e.touches[0].clientX;
    const dy = touchStartYRef.current - e.touches[0].clientY;

    if (dx > 80 && phase !== 'locked') {
      if (!slideCancelled) {
        cancelledRef.current = true;
        setSlideCancelled(true);
      }
    } else if (slideCancelled) {
      cancelledRef.current = false;
      setSlideCancelled(false);
    }

    if (dy > 80 && phase !== 'locked') {
      // M4: Reset cancelled state when locking — user changed their mind
      if (slideCancelled) {
        cancelledRef.current = false;
        setSlideCancelled(false);
      }
      setPhase('locked');
    }
  }, [isRecorderActive, phase, slideCancelled]);

  const handleTouchEnd = useCallback(() => {
    // eslint-disable-next-line no-console
    console.log('[VOICE] touchend', { isRecorderActive, phase });
    if (!isRecorderActive) return;
    if (phase === 'locked') return;
    if (cancelledRef.current) {
      doCancel();
    } else {
      stopAndSend();
    }
  }, [isRecorderActive, phase, doCancel, stopAndSend]);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (isUnsupported) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--bg-secondary)]">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
        <p className="flex-1 text-sm text-[var(--text-muted)]">Voice recording not supported in this browser</p>
      </div>
    );
  }

  if (permissionDenied) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--bg-secondary)]">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
        <p className="flex-1 text-sm text-[var(--text-muted)]">Microphone access denied. Enable it in browser settings.</p>
        <button
          type="button"
          onClick={() => { setPermissionDenied(false); setPhase('initializing'); startRecording(); }}
          className="px-3 py-1.5 text-xs font-medium bg-[var(--accent-primary)] text-[var(--text-inverse)] rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  // Initializing state — no touch handlers active, just a cancel button
  if (phase === 'initializing') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--bg-secondary)] select-none">
        <button
          type="button"
          onClick={doCancel}
          aria-label="Cancel"
          className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
        <div className="flex-1 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
          <span className="text-sm text-[var(--text-muted)]">Starting...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 transition-all touch-none select-none',
        slideCancelled ? 'bg-[var(--bg-tertiary)]' : 'bg-[var(--bg-secondary)]'
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Left: send button */}
      <button
        type="button"
        onClick={stopAndSend}
        aria-label="Send voice message"
        className="w-9 h-9 rounded-full bg-[var(--accent-primary)] flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-inverse)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
        </svg>
      </button>

      {/* Center: duration + waveform + pause */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className={cn(
            'w-2 h-2 rounded-full animate-pulse',
            isPaused ? 'bg-[var(--text-muted)]' : 'bg-red-500'
          )} />
          <span className="text-[13px] font-mono text-[var(--text-primary)]">
            {formatDuration(duration)}
          </span>
        </div>

        {/* Waveform */}
        <div className="flex-1 flex items-center gap-[1px] h-6 min-w-0">
          {waveform.map((v, i) => (
            <div
              key={i}
              className={cn(
                'flex-1 rounded-full transition-all duration-75 min-w-[2px]',
                slideCancelled ? 'bg-[var(--text-muted)]/30' : isPaused ? 'bg-[var(--text-muted)]/40' : 'bg-[var(--accent-primary)]/60'
              )}
              style={{ height: `${Math.max(3, v * 24)}px` }}
            />
          ))}
        </div>

        {/* Pause toggle (locked phase only) */}
        {phase === 'locked' && (
          <button
            type="button"
            onClick={togglePause}
            aria-label={isPaused ? 'Resume' : 'Pause'}
            className="p-1.5 text-[var(--text-muted)] active:text-[var(--text-primary)] flex-shrink-0"
          >
            {isPaused ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Right: cancel button */}
      <button
        type="button"
        onClick={doCancel}
        aria-label="Cancel recording"
        className="w-9 h-9 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center flex-shrink-0 active:opacity-60 transition-opacity"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18" /><path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  );
}
