'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getNotifications(userId: string, limit = 20) {
  const supabase = await createClient()

  // First get notifications
  const { data: notifications, error } = await supabase
    .from('notifications')
    .select('id, user_id, type, actor_id, post_id, comment_id, is_read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !notifications) {
    return []
  }

  // Get unique actor IDs
  const actorIds = [...new Set(notifications.map(n => n.actor_id).filter(Boolean))]

  // Fetch actor profiles in bulk
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', actorIds)

  const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])

  return notifications.map(n => {
    const actor = profileMap.get(n.actor_id)
    return {
      id: n.id,
      type: n.type,
      actor_id: n.actor_id,
      actor_username: actor?.username || '',
      actor_display_name: actor?.display_name || '',
      actor_avatar_url: actor?.avatar_url || null,
      post_id: n.post_id,
      comment_id: n.comment_id,
      is_read: n.is_read,
      created_at: n.created_at,
    }
  })
}

export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = await createClient()

  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  return count || 0
}

export async function markNotificationAsRead(notificationId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', user.id)

  revalidatePath('/notifications')
  return { success: true }
}

export async function markAllNotificationsAsRead() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false)

  revalidatePath('/notifications')
  return { success: true }
}