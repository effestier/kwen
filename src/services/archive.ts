import { createClient } from '@/lib/supabase/client'

export interface ArchivedStory {
  id: string
  media_url: string
  media_type: string
  visibility: string
  overlays: Array<{ overlay_type: string; payload: Record<string, unknown>; z_index: number }>
  created_at: string
  archived_at: string
}

export interface ArchiveMonth {
  month: string // 'YYYY-MM'
  count: number
}

/**
 * Get archived stories for a user, paginated
 * Includes both archived stories AND expired active stories not yet cleaned by cron
 */
export async function getArchivedStories(
  userId: string,
  cursor?: string,
  limit = 50
): Promise<{ stories: ArchivedStory[]; hasMore: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { stories: [], hasMore: false }

  // Try the unified RPC first (migration 050)
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_user_available_stories', {
    p_user_id: userId,
    p_limit: limit + 1,
  })

  if (!rpcError && rpcData) {
    const stories = (rpcData as Array<{ id: string; media_url: string; media_type: string; created_at: string }>)
      .slice(0, limit)
      .map(s => ({
        id: s.id,
        media_url: s.media_url,
        media_type: s.media_type || 'image',
        visibility: 'public' as const,
        overlays: [] as ArchivedStory['overlays'],
        created_at: s.created_at,
        archived_at: s.created_at,
      })) as ArchivedStory[]
    return { stories, hasMore: rpcData.length > limit }
  }

  // Fallback: query both tables manually
  const [archiveResult, expiredResult] = await Promise.all([
    supabase.rpc('get_archived_stories', {
      p_user_id: userId,
      p_cursor: cursor || null,
      p_limit: limit + 1,
    }),
    supabase
      .from('stories')
      .select('id, media_url, media_type, created_at, visibility')
      .eq('user_id', userId)
      .lt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const archived = ((archiveResult.data || []) as ArchivedStory[])
  const expired: ArchivedStory[] = (expiredResult.data || []).map(s => ({
    id: s.id,
    media_url: s.media_url,
    media_type: s.media_type || 'image',
    visibility: s.visibility || 'public',
    overlays: [],
    created_at: s.created_at,
    archived_at: s.created_at,
  }))

  // Merge and deduplicate by id
  const seen = new Set<string>()
  const merged: ArchivedStory[] = []
  for (const s of [...archived, ...expired]) {
    if (!seen.has(s.id)) {
      seen.add(s.id)
      merged.push(s)
    }
  }

  merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const stories = merged.slice(0, limit)
  const hasMore = merged.length > limit

  return { stories, hasMore }
}

/**
 * Get month groupings for archive grid
 * Includes expired stories not yet cleaned by cron
 */
export async function getArchiveMonths(userId: string): Promise<ArchiveMonth[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const [archiveResult, expiredResult] = await Promise.all([
    supabase.rpc('get_archive_months', { p_user_id: userId }),
    supabase
      .from('stories')
      .select('created_at')
      .eq('user_id', userId)
      .lt('expires_at', new Date().toISOString()),
  ])

  const archiveMonths = new Map<string, number>()
  for (const m of (archiveResult.data || []) as Array<{ month: string; count: number }>) {
    archiveMonths.set(m.month, Number(m.count))
  }

  // Add expired stories to month counts
  for (const s of (expiredResult.data || [])) {
    const month = s.created_at.substring(0, 7)
    archiveMonths.set(month, (archiveMonths.get(month) || 0) + 1)
  }

  return Array.from(archiveMonths.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => b.month.localeCompare(a.month))
}

/**
 * Delete an archived story permanently
 */
export async function deleteArchivedStory(storyId: string): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('story_archive')
    .delete()
    .eq('id', storyId)
    .eq('user_id', user.id)

  if (error) return { error: 'Failed to delete' }
  return { success: true }
}

/**
 * Restore an archived story as a new active story
 */
export async function restoreArchivedStory(archiveId: string): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Fetch the archived story
  const { data: archived, error: fetchError } = await supabase
    .from('story_archive')
    .select('*')
    .eq('id', archiveId)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !archived) return { error: 'Archived story not found' }

  // Create new active story from archive
  const { data: newStory, error: insertError } = await supabase
    .from('stories')
    .insert({
      user_id: user.id,
      media_url: archived.media_url,
      media_type: archived.media_type || 'image',
      visibility: archived.visibility || 'public',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single()

  if (insertError || !newStory) return { error: 'Failed to restore story' }

  // Restore overlays if they exist
  if (archived.overlays && Array.isArray(archived.overlays) && archived.overlays.length > 0) {
    const overlayRecords = archived.overlays.map((o: { overlay_type: string; payload: Record<string, unknown>; z_index: number }) => ({
      story_id: newStory.id,
      overlay_type: o.overlay_type,
      payload: JSON.stringify(o.payload),
      z_index: o.z_index || 0,
    }))

    await supabase.from('story_overlays').insert(overlayRecords)
  }

  return { success: true }
}

/**
 * Download an archived story's media
 */
export async function downloadArchivedStory(archiveId: string): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: archived, error: fetchError } = await supabase
    .from('story_archive')
    .select('media_url, media_type')
    .eq('id', archiveId)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !archived) return { error: 'Archived story not found' }

  try {
    const response = await fetch(archived.media_url)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = archived.media_type === 'video' ? 'story-video.mp4' : 'story-image.jpg'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return { success: true }
  } catch {
    return { error: 'Failed to download' }
  }
}

/**
 * Get all stories available for highlight creation (active + expired + archived)
 */
export interface AvailableStory {
  id: string
  media_url: string
  media_type: string
  created_at: string
}

export async function getUserAvailableStories(userId: string): Promise<AvailableStory[]> {
  const supabase = createClient()

  // Try the RPC first (migration 050)
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_user_available_stories', {
    p_user_id: userId,
    p_limit: 100,
  })

  if (!rpcError && rpcData) {
    return rpcData as AvailableStory[]
  }

  // Fallback: query both tables manually
  const [activeResult, archiveResult] = await Promise.all([
    supabase
      .from('stories')
      .select('id, media_url, media_type, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('story_archive')
      .select('id, original_story_id, media_url, media_type, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ])

  const active = (activeResult.data || []).map(s => ({
    id: s.id,
    media_url: s.media_url,
    media_type: s.media_type || 'image',
    created_at: s.created_at,
  })) as AvailableStory[]

  // For archived stories, use original_story_id so highlights can reference them
  const archived = (archiveResult.data || []).map(s => ({
    id: s.original_story_id || s.id,
    media_url: s.media_url,
    media_type: s.media_type || 'image',
    created_at: s.created_at,
  })) as AvailableStory[]

  // Deduplicate by id, prefer active
  const seen = new Set<string>()
  const merged: AvailableStory[] = []
  for (const s of [...active, ...archived]) {
    if (!seen.has(s.id)) {
      seen.add(s.id)
      merged.push(s)
    }
  }

  // Sort by created_at descending
  merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return merged
}
