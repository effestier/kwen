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
 */
export async function getArchivedStories(
  userId: string,
  cursor?: string,
  limit = 50
): Promise<{ stories: ArchivedStory[]; hasMore: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { stories: [], hasMore: false }

  const { data, error } = await supabase.rpc('get_archived_stories', {
    p_user_id: userId,
    p_cursor: cursor || null,
    p_limit: limit + 1, // fetch one extra to check hasMore
  })

  if (error || !data) return { stories: [], hasMore: false }

  const stories = data.slice(0, limit) as ArchivedStory[]
  const hasMore = data.length > limit

  return { stories, hasMore }
}

/**
 * Get month groupings for archive grid
 */
export async function getArchiveMonths(userId: string): Promise<ArchiveMonth[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase.rpc('get_archive_months', {
    p_user_id: userId,
  })

  if (error || !data) return []

  return (data as Array<{ month: string; count: number }>).map(m => ({
    month: m.month,
    count: Number(m.count),
  }))
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
