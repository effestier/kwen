'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleFollow(userId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  if (user.id === userId) {
    return { error: 'Cannot follow yourself' }
  }

  // Check if already following
  const { data: existing } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', user.id)
    .eq('following_id', userId)
    .single()

  if (existing) {
    // Unfollow
    await supabase
      .from('follows')
      .delete()
      .eq('id', existing.id)
  } else {
    // Follow

    const { error: followError } = await supabase
      .from('follows')
      .insert({ follower_id: user.id, following_id: userId })

    if (followError) {
    } else {
    }

    // Create notification with explicit payload
    const notificationPayload = {
      user_id: userId,
      type: 'follow',
      actor_id: user.id,
      is_read: false,
    }


    // First verify target user exists
    const { data: targetUser, error: targetError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single()


    if (targetError) {
    }

    // Insert notification
    const { error: notifError } = await supabase
      .from('notifications')
      .insert(notificationPayload)

    if (notifError) {
    } else {
    }
  }

  revalidatePath(`/profile`)
  return { success: true }
}

export async function getFollowers(userId: string, limit = 20, cursor?: string) {
  const supabase = await createClient()

  let query = supabase
    .from('follows')
    .select('follower_id, created_at')
    .eq('following_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data: follows, error } = await query

  if (error || !follows) {
    return { followers: [], nextCursor: undefined }
  }

  const followerIds = follows.map(f => f.follower_id)

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio, is_verified')
    .in('id', followerIds)

  const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])
  const followers = follows.map(f => profileMap.get(f.follower_id)).filter(Boolean)

  const nextCursor = follows.length === limit ? follows[limit - 1].created_at : undefined

  return { followers, nextCursor }
}

export async function getFollowing(userId: string, limit = 20, cursor?: string) {
  const supabase = await createClient()

  let query = supabase
    .from('follows')
    .select('following_id, created_at')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data: follows, error } = await query

  if (error || !follows) {
    return { following: [], nextCursor: undefined }
  }

  const followingIds = follows.map(f => f.following_id)

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio, is_verified')
    .in('id', followingIds)

  const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])
  const following = follows.map(f => profileMap.get(f.following_id)).filter(Boolean)

  const nextCursor = follows.length === limit ? follows[limit - 1].created_at : undefined

  return { following, nextCursor }
}