// Server action converted to client-side for static export

import { createClient } from '@/lib/supabase/client'

export interface Highlight {
  id: string
  title: string
  cover_url: string | null
  created_at: string
  story_count?: number
}

export interface HighlightStory {
  story_id: string
  media_url: string
  media_type: string
  created_at: string
}

// Get all highlights for a user
export async function getUserHighlights(userId: string): Promise<Highlight[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('story_highlights')
    .select(`
      id,
      title,
      cover_url,
      created_at,
      highlight_stories(count)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching highlights:', error)
    return []
  }

  return (data || []).map(h => ({
    id: h.id,
    title: h.title,
    cover_url: h.cover_url,
    created_at: h.created_at,
    story_count: h.highlight_stories?.[0]?.count || 0,
  }))
}

// Get a single highlight with its stories
export async function getHighlightStories(highlightId: string): Promise<HighlightStory[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .rpc('get_highlight_with_stories', { p_highlight_id: highlightId })

  if (error) {
    console.error('Error fetching highlight stories:', error)
    return []
  }

  return (data || [])
    .filter((s: { story_id: string | null }) => s.story_id != null)
    .map((s: { story_id: string; story_media_url: string | null; story_media_type: string | null; story_created_at: string }) => ({
      story_id: s.story_id,
      media_url: s.story_media_url || '',
      media_type: s.story_media_type || 'image',
      created_at: s.story_created_at,
    }))
}

// Create a new highlight
export async function createHighlight(title: string): Promise<{ id?: string; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { data, error } = await supabase
    .from('story_highlights')
    .insert({
      user_id: user.id,
      title: title || 'Highlights',
    })
    .select()
    .single()

  if (error) {
    return { error: 'Failed to create highlight' }
  }

  return { id: data.id }
}

// Update highlight title
export async function updateHighlightTitle(
  highlightId: string,
  title: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('story_highlights')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', highlightId)
    .eq('user_id', user.id)

  if (error) {
    return { error: 'Failed to update highlight' }
  }

  return { success: true }
}

// Delete a highlight
export async function deleteHighlight(highlightId: string): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('story_highlights')
    .delete()
    .eq('id', highlightId)
    .eq('user_id', user.id)

  if (error) {
    return { error: 'Failed to delete highlight' }
  }

  return { success: true }
}

// Add a story to a highlight
export async function addStoryToHighlight(
  highlightId: string,
  storyId: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient()

  const { error } = await supabase
    .rpc('add_story_to_highlight', {
      p_highlight_id: highlightId,
      p_story_id: storyId,
    })

  if (error) {
    return { error: 'Failed to add story to highlight' }
  }

  return { success: true }
}

// Remove a story from a highlight
export async function removeStoryFromHighlight(
  highlightId: string,
  storyId: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient()

  const { error } = await supabase
    .rpc('remove_story_from_highlight', {
      p_highlight_id: highlightId,
      p_story_id: storyId,
    })

  if (error) {
    return { error: 'Failed to remove story from highlight' }
  }

  return { success: true }
}

// Save current story to highlight (from story viewer)
export async function saveStoryToHighlight(
  storyId: string,
  highlightId?: string
): Promise<{ success?: boolean; highlightId?: string; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // If no highlightId, create a new highlight
  if (!highlightId) {
    const result = await createHighlight('Highlights')
    if (result.error) {
      return { error: result.error }
    }
    highlightId = result.id
  }

  // Add story to highlight
  const addResult = await addStoryToHighlight(highlightId!, storyId)
  if (addResult.error) {
    return { error: addResult.error }
  }

  return { success: true, highlightId }
}

// Update highlight cover image
export async function updateHighlightCover(
  highlightId: string,
  coverUrl: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient()

  const { error } = await supabase
    .rpc('update_highlight_cover', {
      p_highlight_id: highlightId,
      p_cover_url: coverUrl,
    })

  if (error) return { error: 'Failed to update cover' }
  return { success: true }
}

// Reorder stories within a highlight
export async function reorderHighlightStories(
  highlightId: string,
  storyIds: string[]
): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient()

  const { error } = await supabase
    .rpc('reorder_highlight_stories', {
      p_highlight_id: highlightId,
      p_story_ids: storyIds,
    })

  if (error) return { error: 'Failed to reorder' }
  return { success: true }
}
