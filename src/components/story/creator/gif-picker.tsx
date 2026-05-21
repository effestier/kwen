'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

interface TenorGif {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  dims: [number, number];
}

export function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<TenorGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      setLoading(true);
      fetch('/api/gifs?limit=20')
        .then(res => res.json())
        .then(data => {
          setGifs(data.gifs || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/gifs?q=${encodeURIComponent(query)}&limit=20`);
        const data = await res.json();
        setGifs(data.gifs || []);
      } catch {
        // silent
      }
      setLoading(false);
    }, 400);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [query]);

  return (
    <div className="flex flex-col h-[50vh] bg-[var(--bg-primary)]">
      <div className="flex items-center gap-2 p-3 border-b border-[var(--border-subtle)]">
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIFs..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-[var(--bg-secondary)] text-white placeholder:text-[var(--text-muted)] border-none focus:outline-none text-sm"
            autoFocus
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin h-6 w-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full" />
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
            {query ? 'No GIFs found' : 'Search for GIFs'}
          </div>
        ) : (
          <div className="columns-2 gap-2">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => {
                  setSelectedId(gif.id);
                  onSelect(gif.url);
                }}
                className={cn(
                  'w-full mb-2 rounded-lg overflow-hidden border-2 transition-all',
                  selectedId === gif.id ? 'border-[var(--accent-primary)]' : 'border-transparent'
                )}
              >
                <img
                  src={gif.previewUrl}
                  alt={gif.title}
                  width={gif.dims[0]}
                  height={gif.dims[1]}
                  loading="lazy"
                  className="w-full"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
