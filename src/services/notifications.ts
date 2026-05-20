import { createClient } from '@/lib/supabase/client';

export async function getNotifications(limit = 20, cursor?: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { notifications: [], nextCursor: undefined };

    const safeLimit = Math.min(Math.max(1, limit), 50);

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data: notifications, error } = await query;

    if (error || !notifications) return { notifications: [], nextCursor: undefined };

    const actorIds = [...new Set(notifications.map(n => n.actor_id).filter(Boolean))];

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', actorIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const enriched = notifications.map(n => ({
      ...n,
      actor: n.actor_id ? profileMap.get(n.actor_id) || null : null,
    }));

    const nextCursor = notifications.length === safeLimit ? notifications[safeLimit - 1].created_at : undefined;

    return { notifications: enriched, nextCursor };
  } catch {
    return { notifications: [], nextCursor: undefined };
  }
}

export async function markNotificationAsRead(notificationId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !notificationId) return { error: 'Invalid request' };

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', user.id);

    if (error) return { error: 'Failed to mark as read' };
    return { success: true };
  } catch {
    return { error: 'Failed to mark as read' };
  }
}

export async function markAllNotificationsAsRead() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: 'Not authenticated' };

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) return { error: 'Failed to mark all as read' };
    return { success: true };
  } catch {
    return { error: 'Failed to mark all as read' };
  }
}

export async function getUnreadNotificationCount() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return 0;

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}
