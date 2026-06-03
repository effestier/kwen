'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { requestMicrophonePermission } from '@/lib/capacitor';

interface VoiceRecorderProps {
  onSend: (blob: Blob, duration: number) => void;
  onCancel: () => void;
}

export function VoiceRecorder({ onSend, onCancel }: VoiceRecorderProps) {
  // Lifecycle states
  const [phase, setPhase] = useState<'initializing' | 'recording'>('initializing');
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(new Array(40).fill(0));
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
  // Keep a stable ref to onSend so onstop closure always has the latest
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  const cleanup = useCallback(() => {
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
    if (sentRef.current || cancelledRef.current) return;

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);

    const recorder = mediaRecorderRef.current;
    if (recorder && (recorder.state === 'recording' || recorder.state === 'paused')) {
      sentRef.current = true;
      recorder.stop();
      // Don't cleanup here — onstop handler will call onSend, then cleanup
    } else {
      // Recorder not available or already stopped — send whatever chunks we have
      sentRef.current = true;
      const cleanType = mimeTypeRef.current.split(';')[0];
      const blob = new Blob(chunksRef.current, { type: cleanType });
      chunksRef.current = [];
      cleanup();
      if (blob.size > 0) {
        onSendRef.current(blob, durationRef.current);
      } else {
        onCancel();
      }
    }
  }, [onCancel, cleanup]);

  // Single authoritative cancel
  const doCancel = useCallback(() => {
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
    try {
      if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setIsUnsupported(true);
        return;
      }

      // Request microphone permission (handles native + web)
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        setPermissionDenied(true);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // M42: If cancel fired while getUserMedia was pending, stop the stream immediately
      if (cancelledRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

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
        stream.getTracks().forEach(t => t.stop());
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
          audioCtxRef.current.close().catch(() => {});
        }
        // Use sentRef, not cancelledRef — sentRef is set BEFORE stop(), so it's
        // guaranteed to be true when we're sending. cancelledRef can race with
        // the unmount effect if the parent unmounts us during onSend.
        if (sentRef.current && chunksRef.current.length > 0) {
          const cleanType = mimeType.split(';')[0];
          const blob = new Blob(chunksRef.current, { type: cleanType });
          chunksRef.current = [];
          onSendRef.current(blob, durationRef.current);
        }
        cleanup();
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      totalPausedMsRef.current = 0;
      pausedAtRef.current = 0;

      // ONLY NOW is the recorder ready — transition from initializing to recording
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
      // If permission denied (NotAllowedError), show actionable UI instead of silently closing
      if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError')) {
        setPermissionDenied(true);
      } else {
        doCancel();
      }
    }
  }, [doCancel]);

  // Auto-start on mount
  useEffect(() => {
    startRecording();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      // If we already triggered send (sentRef), let the onstop handler
      // finish — don't kill data collection or set cancelledRef.
      if (!sentRef.current) {
        cancelledRef.current = true;
        const recorder = mediaRecorderRef.current;
        if (recorder && (recorder.state === 'recording' || recorder.state === 'paused')) {
          recorder.ondataavailable = null;
          recorder.stop();
        }
        cleanup();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const [isLocked, setIsLocked] = useState(false);

  const handleLockToggle = useCallback(() => {
    setIsLocked(prev => !prev);
  }, []);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-[var(--bg-secondary)] touch-none select-none">
      {/* Left: send button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); stopAndSend(); }}
        onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); stopAndSend(); }}
        aria-label="Send voice message"
        className="w-9 h-9 rounded-full bg-[var(--accent-primary)] flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-inverse)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
        </svg>
      </button>

      {/* Center: duration + waveform */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className={cn(
            'w-2 h-2 rounded-full animate-pulse',
            isPaused ? 'bg-[var(--text-muted)]' : 'bg-[var(--accent-red)]'
          )} />
          <span className="text-[13px] font-mono text-[var(--text-primary)]">
            {formatDuration(duration)}
          </span>
        </div>

        <div className="flex-1 flex items-center gap-[1px] h-6 min-w-0">
          {waveform.map((v, i) => (
            <div
              key={i}
              className={cn(
                'flex-1 rounded-full transition-all duration-75 min-w-[2px]',
                isPaused ? 'bg-[var(--text-muted)]/40' : 'bg-[var(--accent-primary)]/60'
              )}
              style={{ height: `${Math.max(3, v * 24)}px` }}
            />
          ))}
        </div>

        {/* Pause toggle */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); togglePause(); }}
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
      </div>

      {/* Lock / Cancel area */}
      {isLocked ? (
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">Locked</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsLocked(false); }}
            aria-label="Unlock recording"
            className="w-9 h-9 rounded-full bg-[var(--accent-red)]/15 flex items-center justify-center active:scale-90 transition-transform"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleLockToggle(); }}
          onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); handleLockToggle(); }}
          aria-label="Lock recording"
          className="w-9 h-9 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </button>
      )}

      {/* Right: cancel button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); doCancel(); }}
        onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); doCancel(); }}
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
