'use client';

import { useState, useEffect, useRef } from 'react';

interface MusicPickerProps {
  onSelect: (track: { name: string; artist: string; previewUrl: string; coverUrl: string }) => void;
  onClose: () => void;
}

const CURATED_TRACKS = [
  { name: 'Chill Vibes', artist: 'Lofi Dreams', previewUrl: '', coverUrl: '' },
  { name: 'Summer Nights', artist: 'Sunset Collective', previewUrl: '', coverUrl: '' },
  { name: 'Workout Energy', artist: 'Power Beats', previewUrl: '', coverUrl: '' },
  { name: 'Focus Mode', artist: 'Study Session', previewUrl: '', coverUrl: '' },
  { name: 'Party Starter', artist: 'DJ Wave', previewUrl: '', coverUrl: '' },
  { name: 'Acoustic Morning', artist: 'Coffee Shop', previewUrl: '', coverUrl: '' },
  { name: 'Night Drive', artist: 'Midnight Sound', previewUrl: '', coverUrl: '' },
  { name: 'Happy Days', artist: 'Sunshine Band', previewUrl: '', coverUrl: '' },
  { name: 'Romantic Slow', artist: 'Smooth Jazz', previewUrl: '', coverUrl: '' },
  { name: 'Epic Journey', artist: 'Cinematic Sound', previewUrl: '', coverUrl: '' },
  { name: 'Morning Coffee', artist: 'Chill House', previewUrl: '', coverUrl: '' },
  { name: 'Dreamscape', artist: 'Ambient Flow', previewUrl: '', coverUrl: '' },
];

interface Track {
  name: string;
  artist: string;
  previewUrl: string;
  coverUrl: string;
}

export function MusicPicker({ onSelect, onClose }: MusicPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults(CURATED_TRACKS);
    } else {
      const lower = query.toLowerCase();
      setResults(CURATED_TRACKS.filter(
        t => t.name.toLowerCase().includes(lower) || t.artist.toLowerCase().includes(lower)
      ));
    }
  }, [query]);

  const handleTrackSelect = (track: Track) => {
    setSelectedTrack(track);
    setPlayingTrack(null);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  const handlePlayPause = (e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    if (playingTrack === track.name) {
      setPlayingTrack(null);
      audioRef.current?.pause();
    } else {
      setPlayingTrack(track.name);
      if (track.previewUrl && audioRef.current) {
        audioRef.current.src = track.previewUrl;
        audioRef.current.play();
      }
    }
  };

  const handleConfirm = () => {
    if (selectedTrack) {
      onSelect(selectedTrack);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, track: Track) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleTrackSelect(track);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[var(--bg-secondary)] rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-[var(--border-subtle)]">
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
          <h3 className="text-white font-semibold">Music</h3>
        </div>

        <div className="p-3 border-b border-[var(--border-subtle)]">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search music..."
            className="w-full px-4 py-2 rounded-full bg-[var(--bg-tertiary)] text-white placeholder:text-[var(--text-muted)] border-none focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
            autoFocus
          />
        </div>

        <div className="h-64 overflow-y-auto p-2">
          {results.map((track, idx) => (
            <div
              key={idx}
              role="button"
              tabIndex={0}
              onClick={() => handleTrackSelect(track)}
              onKeyDown={(e) => handleKeyDown(e, track)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer ${
                selectedTrack?.name === track.name ? 'bg-[var(--accent-primary)]/20' : ''
              }`}
            >
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{track.name}</p>
                <p className="text-[var(--text-muted)] text-sm truncate">{track.artist}</p>
              </div>
              {selectedTrack?.name === track.name && (
                <button
                  onClick={(e) => handlePlayPause(e, track)}
                  className="p-2 rounded-full bg-[var(--accent-primary)] flex-shrink-0"
                  aria-label={playingTrack === track.name ? 'Pause' : 'Play'}
                >
                  {playingTrack === track.name ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white">
                      <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white">
                      <path d="m5 3 14 9-14 9V3Z" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>

        <audio ref={audioRef} onEnded={() => setPlayingTrack(null)} />

        <div className="p-4 border-t border-[var(--border-subtle)]">
          <button
            onClick={handleConfirm}
            disabled={!selectedTrack}
            className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Add Music
          </button>
        </div>
      </div>
    </div>
  );
}