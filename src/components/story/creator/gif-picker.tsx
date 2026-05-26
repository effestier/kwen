'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/loader';

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
    setLoading(true);
    fetch('/api/gifs?limit=20')
      .then(res => res.json())
      .then(data => {
        setGifs(data.gifs || []);
        if (data.disabled) setLoading(false);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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
            <Spinner size="sm" color="muted" />
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] gap-2">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
              <rect width="18" height="18" x="3" y="3" rx="2" /><path d="M8 7v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7" /><path d="M12 7v7" /><path d="M8 12h4" />
            </svg>
            <p className="text-sm">GIFs coming soon</p>
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
