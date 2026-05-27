'use client';

import { useEffect } from 'react';

export default function FeedError({
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
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <p className="text-sm text-[var(--text-muted)] mb-4">Failed to load your feed.</p>
      <button
        onClick={reset}
        className="px-5 py-2 rounded-full bg-[var(--accent-primary)] text-[var(--text-inverse)] text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        Try Again
      </button>
    </div>
  );
}
