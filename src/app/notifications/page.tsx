'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { Avatar } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils';
import { markAllNotificationsAsRead } from '@/services/notifications';
import { PaginationLoader } from '@/components/ui/loader';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { ListSkeleton } from '@/components/design-system/skeleton';
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
  comment: 'text-[var(--accent-primary)]',
  follow: 'text-[var(--accent-green)]',
  mention: 'text-[var(--accent-primary)]',
};

const contentMap: Record<string, string> = {
  like: 'liked your post',
  comment: 'commented on your post',
  follow: 'started following you',
  mention: 'mentioned you in a post',
};

function getNotificationLink(notif: Notification): string {
  if ((notif.type === 'like' || notif.type === 'comment' || notif.type === 'mention') && notif.post_id) {
    return `/post/${notif.post_id}`;
  }
  return `/profile/${notif.actor_username}`;
}


export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const currentUserId = useRef<string | null>(null);
  const supabase = createClient();

  const loadNotifications = useCallback(async (userId: string, offset: number) => {
    const { data: notifs } = await supabase
      .from('notifications')
      .select('id, type, actor_id, post_id, is_read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + 49);

    if (!notifs || notifs.length === 0) return [];

    const actorIds = [...new Set(notifs.map((n: any) => n.actor_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', actorIds);

    const profileMap = new Map((profiles as any[])?.map((p: any) => [p.id, p]) || []);

    return notifs.map((n: any) => {
      const prof = profileMap.get(n.actor_id) as any;
      return {
        id: n.id,
        type: n.type as Notification['type'],
        actor_id: n.actor_id,
        actor_username: prof?.username || 'User',
        actor_display_name: prof?.display_name || 'User',
        actor_avatar_url: prof?.avatar_url || null,
        post_id: n.post_id,
        is_read: n.is_read,
        created_at: n.created_at,
      };
    });
  }, [supabase]);

  // Initial load
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      currentUserId.current = user.id;

      const notifs = await loadNotifications(user.id, 0);
      setNotifications(notifs);
      if (notifs.length < 50) setHasMore(false);
      setLoading(false);

      // Auto-mark all as read
      if (notifs.some(n => !n.is_read)) {
        await markAllNotificationsAsRead();
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        window.dispatchEvent(new CustomEvent('notifications-read'));
      }
    }
    init();
  }, []);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore || loading || !sentinelRef.current) return;
    const observer = new IntersectionObserver(async (entries) => {
      if (entries[0].isIntersecting && !loadingMore && currentUserId.current) {
        setLoadingMore(true);
        const more = await loadNotifications(currentUserId.current, notifications.length);
        setNotifications(prev => [...prev, ...more]);
        if (more.length < 50) setHasMore(false);
        setLoadingMore(false);
      }
    }, { rootMargin: '200px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, notifications.length]);

  // Realtime: new notifications
  useEffect(() => {
    if (!currentUserId.current) return;
    const channel = supabase
      .channel('notifications-rt')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${currentUserId.current}`,
      }, async (payload) => {
        const n = payload.new as { id: string; type: string; actor_id: string; post_id: string | null; is_read: boolean; created_at: string };
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .eq('id', n.actor_id)
          .single();

        const newNotif: Notification = {
          id: n.id,
          type: n.type as Notification['type'],
          actor_id: n.actor_id,
          actor_username: profile?.username || 'User',
          actor_display_name: profile?.display_name || 'User',
          actor_avatar_url: profile?.avatar_url || null,
          post_id: n.post_id,
          is_read: n.is_read,
          created_at: n.created_at,
        };
        setNotifications(prev => [newNotif, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleMarkAllRead = async () => {
    await markAllNotificationsAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    window.dispatchEvent(new CustomEvent('notifications-read'));
  };

  const handleRefresh = async () => {
    if (!currentUserId.current) return;
    const notifs = await loadNotifications(currentUserId.current, 0);
    setNotifications(notifs);
  };

  return (
    <MainLayout>
      <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen">
        <div className="sticky top-12 lg:top-0 z-10 bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Notifications</h1>
            {notifications.some(n => !n.is_read) && (
              <button
                onClick={handleMarkAllRead}
                className="text-sm text-[var(--accent-primary)]"
              >
                Mark all read
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-3">
            <ListSkeleton items={8} />
          </div>
        ) : notifications.length > 0 ? (
          <div role="feed" aria-label="Notifications" className="divide-y divide-[var(--border-subtle)]">
            {notifications.map((notif) => (
              <Link
                key={notif.id}
                href={getNotificationLink(notif)}
                className={cn(
                  'block p-3 hover:bg-[var(--bg-secondary)] transition-colors-fast',
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
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--text-primary)]">{notif.actor_display_name}</span>
                      {' '}{contentMap[notif.type]}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{formatTimeAgo(notif.created_at)}</p>
                  </div>
                  {!notif.is_read && (
                    <div aria-label="Unread" className="w-2 h-2 rounded-full bg-[var(--accent-primary)] flex-shrink-0" />
                  )}
                </div>
              </Link>
            ))}
            <div ref={sentinelRef} className="h-1" />
            {loadingMore && (
              <PaginationLoader />
            )}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </div>
            <p className="text-[var(--text-primary)] font-medium mb-1">No notifications yet</p>
            <p className="text-sm text-[var(--text-muted)]">When someone interacts with your posts, you'll see it here.</p>
          </div>
        )}
      </div>
      </PullToRefresh>
    </MainLayout>
  );
}
