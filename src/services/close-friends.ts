// Server action converted to client-side for static export

import { createClient } from '@/lib/supabase/client'

export interface CloseFriend {
  friend_id: string
  username: string
  display_name: string
  avatar_url: string | null
}

// Get user's close friends list
export async function getCloseFriends(): Promise<CloseFriend[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return []

  const { data, error } = await supabase
    .rpc('get_close_friends', { p_user_id: user.id })

  if (error) {
    console.error('Error fetching close friends:', error)
    return []
  }

  return data || []
}

// Add a user to close friends
export async function addCloseFriend(
  friendId: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { error } = await supabase
    .from('close_friends')
    .insert({
      user_id: user.id,
      friend_id: friendId,
    })

  if (error) {
    if (error.code === '23505') {
      return { error: 'Already in close friends list' }
    }
    return { error: 'Failed to add to close friends' }
  }

  return { success: true }
}

// Remove a user from close friends
export async function removeCloseFriend(
  friendId: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { error } = await supabase
    .from('close_friends')
    .delete()
    .eq('user_id', user.id)
    .eq('friend_id', friendId)

  if (error) {
    return { error: 'Failed to remove from close friends' }
  }

  return { success: true }
}

// Check if a user is in close friends list
export async function isCloseFriend(
  ownerId: string,
  viewerId: string
): Promise<boolean> {
  const supabase = createClient()

  const { data } = await supabase
    .rpc('is_close_friend', {
      p_owner_id: ownerId,
      p_viewer_id: viewerId,
    })

  return data || false
}

// Toggle close friend status
export async function toggleCloseFriend(
  friendId: string,
  currentlyClose: boolean
): Promise<{ success?: boolean; error?: string }> {
  if (currentlyClose) {
    return removeCloseFriend(friendId)
  } else {
    return addCloseFriend(friendId)
  }
}
