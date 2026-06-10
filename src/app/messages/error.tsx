'use client';

import { useEffect } from 'react';

export default function MessagesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Messages error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center px-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
          Failed to load messages
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Something went wrong while loading your conversations.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-[var(--accent-primary)] text-[var(--text-inverse)] rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
