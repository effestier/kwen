'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Skeleton } from '@/components/design-system/skeleton'

interface ArchivedPost {
  id: string
  content: string | null
  created_at: string
  archived_at: string | null
  thumbnailUrl: string | null
}

interface PostsArchiveGridProps {
  onPostClick: (post: ArchivedPost) => void
}

export function PostsArchiveGrid({ onPostClick }: PostsArchiveGridProps) {
  const [posts, setPosts] = useState<ArchivedPost[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      // Get archived posts — try archived_at first, fall back to deleted_at
      let dbPosts: any[] | null = null

      // Try archived_at column (migration 049)
      const { data: archivedData, error: archivedErr } = await supabase
        .from('posts')
        .select('id, content, created_at, archived_at, deleted_at, post_media(storage_path, media_type, sort_order)')
        .eq('user_id', user.id)
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false })
        .limit(100)

      if (!archivedErr && archivedData && archivedData.length > 0) {
        dbPosts = archivedData
      } else {
        // Fallback: soft-deleted posts
        const { data: deletedData } = await supabase
          .from('posts')
          .select('id, content, created_at, deleted_at, post_media(storage_path, media_type, sort_order)')
          .eq('user_id', user.id)
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false })
          .limit(100)
        dbPosts = deletedData
      }

      if (!dbPosts) { setLoading(false); return }

      const mapped: ArchivedPost[] = dbPosts.map(p => {
        const media = ((p as any).post_media || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
        const thumb = media[0]
        const thumbnailUrl = thumb
          ? supabase.storage.from('posts').getPublicUrl(thumb.storage_path).data.publicUrl
          : null
        return {
          id: p.id,
          content: p.content,
          created_at: p.created_at,
          archived_at: p.archived_at || p.deleted_at,
          thumbnailUrl,
        }
      })

      setPosts(mapped)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-0.5 p-0.5">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/5]" />
        ))}
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-muted)] mb-3" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <p className="text-[var(--text-muted)] font-medium">No archived posts</p>
        <p className="text-sm text-[var(--text-muted)] mt-1">Posts you archive will appear here</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-0.5 p-0.5">
      {posts.map(post => (
        <button
          key={post.id}
          onClick={() => onPostClick(post)}
          className="relative aspect-[4/5] bg-[var(--bg-secondary)] overflow-hidden group"
        >
          {post.thumbnailUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={post.thumbnailUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-2">
              <p className="text-xs text-[var(--text-muted)] line-clamp-3 text-center">{post.content || 'No content'}</p>
            </div>
          )}

          {/* Archived badge */}
          <div className="absolute top-1 right-1">
            <div className="w-5 h-5 rounded-full bg-black/50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}
