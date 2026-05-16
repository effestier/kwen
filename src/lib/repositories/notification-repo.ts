import { createClient } from '@/lib/supabase/server'

export interface Notification {
  id: string
  user_id: string
  type: 'like' | 'comment' | 'follow' | 'mention'
  actor_id: string
  post_id: string | null
  comment_id: string | null
  is_read: boolean
  created_at: string
}

export interface NotificationWithActor extends Notification {
  actor_username: string
  actor_display_name: string
  actor_avatar_url: string | null
}

export class NotificationRepository {
  private supabase = createClient

  async getByUser(userId: string, limit = 20, cursor?: string): Promise<NotificationWithActor[]> {
    const supabase = await this.supabase()

    let query = supabase
      .from('notifications')
      .select('*, actor:profiles!inner(id, username, display_name, avatar_url)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data, error } = await query
    if (error || !data) return []

    return data.map(n => ({
      ...n,
      actor_username: n.actor?.username || '',
      actor_display_name: n.actor?.display_name || '',
      actor_avatar_url: n.actor?.avatar_url || null,
    }))
  }

  async getUnreadCount(userId: string): Promise<number> {
    const supabase = await this.supabase()
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    return count || 0
  }

  async markAsRead(id: string, userId: string): Promise<boolean> {
    const supabase = await this.supabase()

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', userId)

    return !error
  }

  async markAllAsRead(userId: string): Promise<boolean> {
    const supabase = await this.supabase()

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    return !error
  }

  // Internal: create notification (called from server actions)
  async create(data: {
    user_id: string
    type: Notification['type']
    actor_id: string
    post_id?: string
    comment_id?: string
  }): Promise<boolean> {
    const supabase = await this.supabase()

    const { error } = await supabase
      .from('notifications')
      .insert(data)

    return !error
  }
}