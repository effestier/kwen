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
