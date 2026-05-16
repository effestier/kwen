'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

// Free tier: 20 queries/hour, 2000 queries/day
const TENOR_API_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ';

interface TenorGif {
  id: string;
  title: string;
  media_formats: {
    tinygif: { url: string; dims: [number, number] };
    nanogif: { url: string; dims: [number, number] };
    mediumgif: { url: string; dims: [number, number] };
  };
}

export function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<TenorGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Search GIFs from Tenor
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      // Load trending GIFs when no query
      setLoading(true);
      fetch(`https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&limit=20&media_filter=gif`)
        .then(res => res.json())
        .then(data => {
          setGifs(data.results || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_API_KEY}&limit=20&media_filter=gif`
        );
        const data = await res.json();
        setGifs(data.results || []);
      } catch (e) {
        console.error('Tenor API error:', e);
      }
      setLoading(false);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query]);

  const handleSelect = (gif: TenorGif) => {
    setSelectedId(gif.id);
    // Use tinygif for preview, mediumgif for actual use
    const url = gif.media_formats.tinygif?.url || gif.media_formats.nanogif?.url;
    if (url) {
      onSelect(url);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[var(--bg-secondary)] rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-[var(--border-subtle)]">
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
          <h3 className="text-white font-semibold">GIFs</h3>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-[var(--border-subtle)]">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIFs..."
            className="w-full px-4 py-2 rounded-full bg-[var(--bg-tertiary)] text-white placeholder:text-[var(--text-muted)] border-none focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
            autoFocus
          />
        </div>

        {/* GIF Grid */}
        <div className="h-80 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          ) : gifs.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {gifs.map((gif) => (
                <button
                  key={gif.id}
                  onClick={() => handleSelect(gif)}
                  className={cn(
                    'relative aspect-square rounded-lg overflow-hidden bg-[var(--bg-tertiary)]',
                    selectedId === gif.id && 'ring-2 ring-[var(--accent-primary)]'
                  )}
                >
                  <img
                    src={gif.media_formats.tinygif?.url || gif.media_formats.nanogif?.url}
                    alt={gif.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
              No GIFs found
            </div>
          )}
        </div>

        {/* Attribution */}
        <div className="p-2 text-center text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]">
          Powered by Tenor
        </div>
      </div>
    </div>
  );
}