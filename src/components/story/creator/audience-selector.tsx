'use client';

import { cn } from '@/lib/utils';

interface AudienceSelectorProps {
  value: 'public' | 'followers' | 'close_friends';
  onChange: (value: 'public' | 'followers' | 'close_friends') => void;
}

const OPTIONS = [
  {
    value: 'public' as const,
    label: 'Public',
    description: 'Anyone can view',
    icon: '🌍',
  },
  {
    value: 'followers' as const,
    label: 'Followers',
    description: 'Your followers only',
    icon: '👥',
  },
  {
    value: 'close_friends' as const,
    label: 'Close Friends',
    description: 'Only close friends',
    icon: '⭐',
  },
];

export function AudienceSelector({ value, onChange }: AudienceSelectorProps) {
  return (
    <div className="bg-black/90 backdrop-blur-xl p-4">
      <p className="text-white text-sm mb-3">Who can see this story?</p>

      <div className="space-y-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'w-full flex items-center gap-3 p-3 rounded-lg transition-colors',
              value === option.value
                ? 'bg-[var(--accent-primary)]/20 border border-[var(--accent-primary)]'
                : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
            )}
          >
            <span className="text-xl">{option.icon}</span>
            <div className="text-left flex-1">
              <p className="text-white text-sm font-medium">{option.label}</p>
              <p className="text-[var(--text-muted)] text-xs">{option.description}</p>
            </div>
            {value === option.value && (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--accent-primary)]">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}