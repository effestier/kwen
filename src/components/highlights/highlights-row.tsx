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
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
      {/* Add highlight button (only on own profile) */}
      {isOwnProfile && (
        <button
          onClick={onCreateHighlight}
          className="flex flex-col items-center gap-1.5 flex-shrink-0"
        >
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-[var(--border-subtle)] flex items-center justify-center bg-[var(--bg-secondary)]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
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
          <span className="text-xs text-[var(--text-muted)] max-w-[64px] truncate">
            New
          </span>
        </button>
      )}

      {/* Highlight circles */}
      {highlights.map((highlight) => (
        <button
          key={highlight.id}
          onClick={() => onHighlightClick(highlight)}
          className="flex flex-col items-center gap-1.5 flex-shrink-0"
        >
          <div className="w-16 h-16 rounded-full p-0.5 bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)]">
            <div className="w-full h-full rounded-full p-0.5 bg-[var(--bg-primary)] overflow-hidden">
              {highlight.cover_url ? (
                <img
                  src={highlight.cover_url}
                  alt={highlight.title}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <div className="w-full h-full rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-[var(--text-muted)]"
                  >
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
              )}
            </div>
          </div>
          <span className="text-xs text-[var(--text-primary)] max-w-[64px] truncate">
            {highlight.title}
          </span>
          {highlight.story_count !== undefined && highlight.story_count > 0 && (
            <span className="text-[10px] text-[var(--text-muted)]">
              {highlight.story_count} {highlight.story_count === 1 ? 'story' : 'stories'}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
