'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getArchivedStories, getArchiveMonths, type ArchivedStory, type ArchiveMonth } from '@/services/archive'
import { Skeleton } from '@/components/design-system/skeleton'

interface ArchiveGridProps {
  onStoryClick: (stories: ArchivedStory[], index: number) => void
}

export function ArchiveGrid({ onStoryClick }: ArchiveGridProps) {
  const [months, setMonths] = useState<ArchiveMonth[]>([])
  const [storiesByMonth, setStoriesByMonth] = useState<Map<string, ArchivedStory[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadingMonth, setLoadingMonth] = useState<string | null>(null)
  const [cursors, setCursors] = useState<Map<string, string | undefined>>(new Map())
  const [hasMoreByMonth, setHasMoreByMonth] = useState<Map<string, boolean>>(new Map())

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const monthList = await getArchiveMonths(user.id)
      setMonths(monthList)

      // Load first batch for each month (first 2)
      for (const m of monthList.slice(0, 2)) {
        await loadMonthStories(user.id, m.month)
      }
      setLoading(false)
    }
    load()
  }, [])

  const loadMonthStories = async (userId: string, month: string) => {
    if (storiesByMonth.has(month)) return
    setLoadingMonth(month)

    // H27: Fetch only first page (20 stories) per month, not all 200
    const { stories, hasMore } = await getArchivedStories(userId, undefined, 20)

    // Group by month
    const grouped = new Map<string, ArchivedStory[]>()
    for (const s of stories) {
      const m = s.created_at.substring(0, 7) // 'YYYY-MM'
      if (!grouped.has(m)) grouped.set(m, [])
      grouped.get(m)!.push(s)
    }

    // Only keep stories for the requested month
    const monthStories = grouped.get(month) || []

    setStoriesByMonth(prev => {
      const next = new Map(prev)
      next.set(month, monthStories)
      return next
    })

    setHasMoreByMonth(prev => new Map(prev).set(month, hasMore))
    if (stories.length > 0) {
      const lastStory = stories[stories.length - 1]
      setCursors(prev => new Map(prev).set(month, lastStory.created_at))
    }
    setLoadingMonth(null)
  }

  const formatMonth = (month: string) => {
    const [y, m] = month.split('-')
    const date = new Date(parseInt(y), parseInt(m) - 1)
    return date.toLocaleDateString([], { month: 'long', year: 'numeric' })
  }

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-1 p-1">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
        ))}
      </div>
    )
  }

  if (months.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-muted)] mb-4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <p className="text-[var(--text-muted)] font-medium">No archived stories yet</p>
        <p className="text-sm text-[var(--text-muted)] mt-1">Stories are archived after 24 hours</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {months.map((m) => {
        const stories = storiesByMonth.get(m.month) || []
        const isLoadingThisMonth = loadingMonth === m.month

        return (
          <div key={m.month}>
            <div className="flex items-center justify-between px-4 py-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {formatMonth(m.month)}
              </h3>
              <span className="text-xs text-[var(--text-muted)]">{m.count} stories</span>
            </div>

            {stories.length === 0 && !isLoadingThisMonth ? (
              <button
                onClick={() => {
                  supabase.auth.getUser().then(({ data: { user } }) => {
                    if (user) loadMonthStories(user.id, m.month)
                  })
                }}
                className="w-full py-4 text-sm text-[var(--accent-primary)]"
              >
                Load {m.count} stories
              </button>
            ) : isLoadingThisMonth ? (
              <div className="grid grid-cols-3 gap-1 px-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1 px-1">
                {stories.map((story, idx) => (
                  <button
                    key={story.id}
                    onClick={() => onStoryClick(stories, idx)}
                    className="relative aspect-[3/4] rounded-lg overflow-hidden bg-[var(--bg-secondary)] group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={story.media_url}
                      alt="Archived story"
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-1 left-1 right-1 text-[10px] text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
                      {new Date(story.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
