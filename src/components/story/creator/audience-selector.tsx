'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { hapticLight } from '@/lib/haptics';

interface AudienceSelectorProps {
  value: 'public' | 'followers' | 'close_friends';
  onChange: (value: 'public' | 'followers' | 'close_friends') => void;
}

const STORAGE_KEY = 'kw-story-audience';

const OPTIONS = [
  {
    value: 'public' as const,
    label: 'Public',
    description: 'Anyone can view',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    value: 'followers' as const,
    label: 'Followers',
    description: 'Your followers only',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    value: 'close_friends' as const,
    label: 'Close Friends',
    description: 'Only close friends',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
    ),
  },
];

export function AudienceSelector({ value, onChange }: AudienceSelectorProps) {
  // Restore last selection on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as 'public' | 'followers' | 'close_friends' | null;
    if (saved && ['public', 'followers', 'close_friends'].includes(saved)) {
      onChange(saved);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (newValue: 'public' | 'followers' | 'close_friends') => {
    onChange(newValue);
    localStorage.setItem(STORAGE_KEY, newValue);
    hapticLight();
  };

  return (
    <div className="bg-black/90 backdrop-blur-xl p-4">
      <p className="text-white text-sm mb-3">Who can see this story?</p>

      <div className="space-y-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => handleChange(option.value)}
            className={cn(
              'w-full flex items-center gap-3 p-3 rounded-xl transition-all',
              value === option.value
                ? 'bg-white/10 border border-white/30'
                : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-transparent'
            )}
          >
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center',
              value === option.value ? 'text-white' : 'text-[var(--text-muted)]'
            )}>
              {option.icon}
            </div>
            <div className="text-left flex-1">
              <p className="text-white text-sm font-medium">{option.label}</p>
              <p className="text-[var(--text-muted)] text-xs">{option.description}</p>
            </div>
            {value === option.value && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
