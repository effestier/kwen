'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg-primary)] px-6">
      <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]">
          <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Something went wrong</h2>
      <p className="text-sm text-[var(--text-muted)] mb-6 text-center max-w-sm">An unexpected error occurred. Please try again.</p>
      <button
        onClick={reset}
        className="px-6 py-2.5 rounded-full bg-[var(--accent-primary)] text-[var(--text-inverse)] text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        Try Again
      </button>
    </div>
  );
}
