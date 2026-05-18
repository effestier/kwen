'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { Avatar } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils';
import { markAllNotificationsAsRead } from '@/app/actions/notifications';
import Link from 'next/link';

interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention';
  actor_id: string;
  actor_username: string;
  actor_display_name: string;
  actor_avatar_url: string | null;
  post_id: string | null;
  is_read: boolean;
  created_at: string;
}

const iconMap: Record<string, React.ReactNode> = {
  like: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>,
  comment: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  follow: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" /></svg>,
  mention: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></svg>,
};

const iconColors: Record<string, string> = {
  like: 'text-[var(--accent-red)]',
  comment: 'text-[var(--accent-blue)]',
  follow: 'text-[var(--accent-green)]',
  mention: 'text-[var(--accent-primary)]',
};

const contentMap: Record<string, string> = {
  like: 'liked your post',
  comment: 'commented on your post',
  follow: 'started following you',
  mention: 'mentioned you in a post',
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadNotifications() {

      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        setLoading(false);
        return;
      }

      // First get notifications without join
      const { data: notifs, error: notifError } = await supabase
        .from('notifications')
        .select('id, type, actor_id, post_id, is_read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);


      if (notifError) {
        setLoading(false);
        return;
      }

      if (!notifs || notifs.length === 0) {
        setNotifications([]);
        setLoading(false);
        return;
      }

      // Get unique actor IDs
      const actorIds = [...new Set(notifs.map(n => n.actor_id))];

      // Fetch actor profiles separately
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', actorIds);


      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Map notifications with profile data
      const mappedNotifications: Notification[] = notifs.map(n => {
        const profile = profileMap.get(n.actor_id);
        return {
          id: n.id,
          type: n.type as 'like' | 'comment' | 'follow' | 'mention',
          actor_id: n.actor_id,
          actor_username: profile?.username || 'User',
          actor_display_name: profile?.display_name || 'User',
          actor_avatar_url: profile?.avatar_url || null,
          post_id: n.post_id,
          is_read: n.is_read,
          created_at: n.created_at,
        };
      });


      setNotifications(mappedNotifications);
      setLoading(false);

      // Auto-mark all as read when visiting notifications page
      if (notifs.some(n => !n.is_read)) {
        await markAllNotificationsAsRead();
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        // Notify sidebar to reset badge
        window.dispatchEvent(new CustomEvent('notifications-read'));
      }
    }

    loadNotifications();
  }, []);

  const handleMarkAllRead = async () => {
    await markAllNotificationsAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  return (
    <MainLayout>
      <div className="min-h-screen">
        <div className="sticky top-0 z-10 bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border-subtle)] p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">Notifications</h1>
            <button
              onClick={handleMarkAllRead}
              className="text-sm text-[var(--accent-primary)] hover:underline"
            >
              Mark all read
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-[var(--text-muted)]">Loading...</div>
          </div>
        ) : notifications.length > 0 ? (
          <div role="feed" aria-label="Notifications" className="divide-y divide-[var(--border-subtle)]">
            {notifications.map((notif) => (
              <Link
                key={notif.id}
                href={`/profile/${notif.actor_username}`}
                className={cn(
                  'block p-4 hover:bg-[var(--bg-secondary)] transition-colors-fast',
                  !notif.is_read && 'bg-[var(--bg-secondary)]/50'
                )}
              >
                <div className="flex items-start gap-3">
                  <div aria-hidden="true" className={cn('p-1.5 rounded-full', iconColors[notif.type])}>
                    {iconMap[notif.type]}
                  </div>
                  <Avatar
                    src={notif.actor_avatar_url}
                    name={notif.actor_display_name}
                    size="md"
                  />
                  <div className="flex-1">
                    <p className="text-sm text-[var(--text-secondary)]">
                      <span className="font-semibold text-white">{notif.actor_display_name}</span>
                      {' '}{contentMap[notif.type]}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{formatTimeAgo(notif.created_at)}</p>
                  </div>
                  {!notif.is_read && (
                    <div aria-label="Unread" className="w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-[var(--text-muted)]">No notifications yet</p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}