'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { hapticLight } from '@/lib/haptics';

interface MusicPickerProps {
  onSelect: (track: { name: string; artist: string; previewUrl: string; coverUrl: string; startTime: number; duration: number }) => void;
  onClose: () => void;
}

interface Track {
  id: number;
  name: string;
  artist: string;
  previewUrl: string;
  coverUrl: string;
  duration: number;
}

const TRENDING_QUERIES = ['pop', 'hip hop', 'electronic', 'indie', 'chill', 'latin', 'r&b'];

export function MusicPicker({ onSelect, onClose }: MusicPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [trending, setTrending] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trim state
  const [trimStart, setTrimStart] = useState(0);
  const [trimDuration, setTrimDuration] = useState(15);
  const [volume, setVolume] = useState(80);

  // Load trending on mount
  useEffect(() => {
    const randomQuery = TRENDING_QUERIES[Math.floor(Math.random() * TRENDING_QUERIES.length)];
    fetchTracks(randomQuery, true);
  }, []);

  const fetchTracks = useCallback(async (q: string, isTrending = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/music/search?q=${encodeURIComponent(q)}&limit=20`);
      const data = await res.json();
      if (isTrending) {
        setTrending(data.tracks || []);
      } else {
        setResults(data.tracks || []);
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, []);

  // Search with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!query.trim()) {
      setResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      fetchTracks(query);
    }, 400);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [query, fetchTracks]);

  const handlePlayPause = (track: Track) => {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(track.previewUrl);
      audio.volume = volume / 100;
      audio.currentTime = trimStart;
      audio.ontimeupdate = () => {
        if (audio.currentTime >= trimStart + trimDuration) {
          audio.pause();
          setPlayingId(null);
        }
      };
      audio.onended = () => setPlayingId(null);
      audio.play();
      audioRef.current = audio;
      setPlayingId(track.id);
    }
  };

  const handleConfirm = () => {
    if (!selectedTrack) return;
    audioRef.current?.pause();
    onSelect({
      name: selectedTrack.name,
      artist: selectedTrack.artist,
      previewUrl: selectedTrack.previewUrl,
      coverUrl: selectedTrack.coverUrl,
      startTime: trimStart,
      duration: trimDuration,
    });
    onClose();
  };

  const displayTracks = query.trim() ? results : trending;

  return (
    <div className="fixed inset-0 z-50 bg-[var(--bg-primary)] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)]" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <button onClick={() => { audioRef.current?.pause(); onClose(); }} className="text-white p-1">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h3 className="text-white font-semibold text-lg">Music</h3>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs, artists..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--bg-secondary)] text-white placeholder:text-[var(--text-muted)] border-none focus:outline-none focus:ring-2 focus:ring-white/20 text-sm"
            autoFocus
          />
        </div>
      </div>

      {/* Section label */}
      <div className="px-4 pb-2">
        <p className="text-[var(--text-muted)] text-xs font-medium uppercase tracking-wider">
          {query.trim() ? 'Search Results' : 'Trending'}
        </p>
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto px-2">
        {loading && displayTracks.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-50">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
            <p className="text-sm">Search for music to add to your story</p>
          </div>
        ) : (
          <div className="space-y-1">
            {displayTracks.map((track) => (
              <button
                key={track.id}
                onClick={() => {
                  setSelectedTrack(track);
                  setTrimStart(0);
                  setTrimDuration(Math.min(15, track.duration));
                  hapticLight();
                  handlePlayPause(track);
                }}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left',
                  selectedTrack?.id === track.id
                    ? 'bg-white/10'
                    : 'hover:bg-[var(--bg-secondary)]'
                )}
              >
                {/* Album art */}
                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-[var(--bg-secondary)]">
                  {track.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={track.coverUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-muted)]">
                        <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Track info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{track.name}</p>
                  <p className="text-[var(--text-muted)] text-xs truncate">{track.artist}</p>
                </div>

                {/* Play indicator */}
                <div className="flex-shrink-0">
                  {playingId === track.id ? (
                    <div className="flex gap-0.5 items-end h-4">
                      <div className="w-1 bg-white animate-pulse" style={{ height: '60%' }} />
                      <div className="w-1 bg-white animate-pulse" style={{ height: '100%', animationDelay: '0.1s' }} />
                      <div className="w-1 bg-white animate-pulse" style={{ height: '40%', animationDelay: '0.2s' }} />
                      <div className="w-1 bg-white animate-pulse" style={{ height: '80%', animationDelay: '0.3s' }} />
                    </div>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-muted)]">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected track — trim + volume + add */}
      {selectedTrack && (
        <div className="p-4 border-t border-[var(--border-subtle)] space-y-3" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          {/* Track info */}
          <div className="flex items-center gap-3">
            {selectedTrack.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedTrack.coverUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{selectedTrack.name}</p>
              <p className="text-[var(--text-muted)] text-xs truncate">{selectedTrack.artist}</p>
            </div>
            <button
              onClick={() => handlePlayPause(selectedTrack)}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
            >
              {playingId === selectedTrack.id ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="m5 3 14 9-14 9V3Z" /></svg>
              )}
            </button>
          </div>

          {/* Trim slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[var(--text-muted)] text-xs">Clip start</span>
              <span className="text-white/60 text-xs">{trimStart}s — {trimStart + trimDuration}s</span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, selectedTrack.duration - 15)}
              value={trimStart}
              onChange={(e) => setTrimStart(Number(e.target.value))}
              className="w-full accent-white"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[var(--text-muted)] text-xs">Duration</span>
              <span className="text-white/60 text-xs">{trimDuration}s</span>
            </div>
            <input
              type="range"
              min={5}
              max={Math.min(15, selectedTrack.duration)}
              value={trimDuration}
              onChange={(e) => setTrimDuration(Number(e.target.value))}
              className="w-full accent-white"
            />
          </div>

          {/* Volume slider */}
          <div className="flex items-center gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-muted)]">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            </svg>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                if (audioRef.current) audioRef.current.volume = Number(e.target.value) / 100;
              }}
              className="flex-1 accent-white"
            />
            <span className="text-[var(--text-muted)] text-xs w-8 text-right">{volume}%</span>
          </div>

          {/* Music sticker preview */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg">
            <span className="text-xs">🎵</span>
            <span className="text-white/70 text-xs truncate">{selectedTrack.name} — {selectedTrack.artist}</span>
          </div>

          {/* Add button */}
          <button
            onClick={handleConfirm}
            className="w-full py-3 rounded-xl bg-white text-black font-semibold hover:opacity-90 transition-opacity text-sm"
          >
            Add to Story
          </button>
        </div>
      )}
    </div>
  );
}
