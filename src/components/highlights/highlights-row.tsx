'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Highlight } from '@/services/highlights'

interface HighlightsRowProps {
  highlights: Highlight[]
  isOwnProfile: boolean
  onHighlightClick: (highlight: Highlight) => void
  onCreateHighlight: () => void
}

export function HighlightsRow({
  highlights,
  isOwnProfile,
  onHighlightClick,
  onCreateHighlight,
}: HighlightsRowProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide px-4">
      {/* Add collection button (only on own profile) */}
      {isOwnProfile && (
        <button
          onClick={onCreateHighlight}
          className="flex flex-col items-center gap-1.5 flex-shrink-0"
        >
          <div className="w-16 h-16 rounded-lg border-2 border-dashed border-[var(--border-soft)] flex items-center justify-center bg-[var(--bg-secondary)]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--text-muted)]"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
          </div>
          <span className="text-[11px] text-[var(--text-muted)] max-w-16 truncate">
            New
          </span>
        </button>
      )}

      {/* Collection cards */}
      {highlights.map((highlight) => (
        <button
          key={highlight.id}
          onClick={() => onHighlightClick(highlight)}
          className="flex flex-col items-center gap-1.5 flex-shrink-0"
        >
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-[var(--bg-tertiary)]">
            {highlight.cover_url ? (
              <img
                src={highlight.cover_url}
                alt={highlight.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[var(--bg-secondary)]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-[var(--text-muted)]"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="m9 14 2-2 4 4" />
                  <circle cx="15" cy="9" r="2" />
                </svg>
              </div>
            )}
          </div>
          <span className="text-[11px] text-[var(--text-primary)] max-w-16 truncate">
            {highlight.title}
          </span>
        </button>
      ))}
    </div>
  )
}
