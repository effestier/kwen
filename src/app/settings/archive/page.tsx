'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { createClient } from '@/lib/supabase/client'
import { ArchiveGrid } from '@/components/archive/archive-grid'
import { ArchiveViewer } from '@/components/archive/archive-viewer'
import type { ArchivedStory } from '@/services/archive'

export default function ArchivePage() {
  const [activeTab, setActiveTab] = useState<'stories' | 'posts'>('stories')
  const [viewerStories, setViewerStories] = useState<ArchivedStory[] | null>(null)
  const [viewerIndex, setViewerIndex] = useState(0)
  const supabase = createClient()

  return (
    <MainLayout>
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--bg-primary)] border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-3 px-4 py-3">
          <a href="/settings" className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </a>
          <h1 className="text-base font-semibold text-[var(--text-primary)]">Archive</h1>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border-subtle)]">
          <button
            onClick={() => setActiveTab('stories')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors relative ${
              activeTab === 'stories' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
            }`}
          >
            Stories
            {activeTab === 'stories' && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent-primary)]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('posts')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors relative ${
              activeTab === 'posts' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
            }`}
          >
            Posts
            {activeTab === 'posts' && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent-primary)]" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="pb-20">
        {activeTab === 'stories' ? (
          <ArchiveGrid
            onStoryClick={(stories, index) => {
              setViewerStories(stories)
              setViewerIndex(index)
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-muted)] mb-4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <p className="text-[var(--text-muted)] font-medium">Post archive coming soon</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">Your archived posts will appear here</p>
          </div>
        )}
      </div>

      {/* Archive viewer */}
      {viewerStories && (
        <ArchiveViewer
          stories={viewerStories}
          initialIndex={viewerIndex}
          onClose={() => setViewerStories(null)}
          onDelete={(storyId) => {
            setViewerStories(prev => {
              if (!prev) return null
              const filtered = prev.filter(s => s.id !== storyId)
              return filtered.length > 0 ? filtered : null
            })
          }}
        />
      )}
    </MainLayout>
  )
}
