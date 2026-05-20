'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface MusicPickerProps {
  onSelect: (track: { name: string; artist: string; previewUrl: string; coverUrl: string }) => void;
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
    });
    onClose();
  };

  const displayTracks = query.trim() ? results : trending;

  return (
    <div className="fixed inset-0 z-50 bg-[var(--bg-primary)] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
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
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--bg-secondary)] text-white placeholder:text-[var(--text-muted)] border-none focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] text-sm"
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
            <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
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
                  handlePlayPause(track);
                }}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left',
                  selectedTrack?.id === track.id
                    ? 'bg-[var(--accent-primary)]/20'
                    : 'hover:bg-[var(--bg-secondary)]'
                )}
              >
                {/* Album art */}
                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-[var(--bg-secondary)]">
                  {track.coverUrl ? (
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
                      <div className="w-1 bg-[var(--accent-primary)] animate-pulse" style={{ height: '60%' }} />
                      <div className="w-1 bg-[var(--accent-primary)] animate-pulse" style={{ height: '100%', animationDelay: '0.1s' }} />
                      <div className="w-1 bg-[var(--accent-primary)] animate-pulse" style={{ height: '40%', animationDelay: '0.2s' }} />
                      <div className="w-1 bg-[var(--accent-primary)] animate-pulse" style={{ height: '80%', animationDelay: '0.3s' }} />
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

      {/* Selected track + Add button */}
      {selectedTrack && (
        <div className="p-4 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-3 mb-3">
            {selectedTrack.coverUrl && (
              <img src={selectedTrack.coverUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{selectedTrack.name}</p>
              <p className="text-[var(--text-muted)] text-xs truncate">{selectedTrack.artist}</p>
            </div>
          </div>
          <button
            onClick={handleConfirm}
            className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-white font-semibold hover:opacity-90 transition-opacity text-sm"
          >
            Add to Story
          </button>
        </div>
      )}
    </div>
  );
}
