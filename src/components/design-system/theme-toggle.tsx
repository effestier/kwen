'use client';

import { useTheme } from '@/lib/theme/hooks';
import { Theme } from '@/lib/theme/themes';

interface ThemeToggleProps {
  variant?: 'full' | 'compact';
}

export function ThemeToggle({ variant = 'full' }: ThemeToggleProps) {
  const { theme, setTheme, isLoading } = useTheme();

  const themes: { value: Theme; label: string; icon: string }[] = [
    { value: 'light', label: 'Light', icon: '☀️' },
    { value: 'dark', label: 'Dark', icon: '🌙' },
    { value: 'system', label: 'System', icon: '💻' },
  ];

  if (isLoading) {
    return (
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-20 h-10 rounded-lg skeleton"
          />
        ))}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTheme('light')}
          className={`p-2 rounded-lg transition-all ${
            theme === 'light'
              ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)]'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
          }`}
          aria-label="Light theme"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
          </svg>
        </button>
        <button
          onClick={() => setTheme('dark')}
          className={`p-2 rounded-lg transition-all ${
            theme === 'dark'
              ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)]'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
          }`}
          aria-label="Dark theme"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
        </button>
        <button
          onClick={() => setTheme('system')}
          className={`p-2 rounded-lg transition-all ${
            theme === 'system'
              ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)]'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
          }`}
          aria-label="System theme"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="14" x="2" y="3" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--text-secondary)]">
        Choose how the app looks.
      </p>

      <div className="grid grid-cols-3 gap-3">
        {themes.map((t) => (
          <button
            key={t.value}
            onClick={() => setTheme(t.value)}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
              theme === t.value
                ? 'border-[var(--accent-primary)] bg-[var(--accent-secondary)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            <span className="text-2xl">{t.icon}</span>
            <span className={`text-sm font-medium ${
              theme === t.value ? 'text-[var(--accent-primary)]' : 'text-[var(--text-secondary)]'
            }`}>
              {t.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}