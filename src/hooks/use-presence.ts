'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Tracks online presence for users.
 * - Calls update_user_presence RPC on mount/unmount
 * - Subscribes to profiles table changes for real-time online status
 * - Returns a Set of online user IDs
 */
export function usePresence(currentUserId: string | null) {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Mark current user as online
  useEffect(() => {
    if (!currentUserId) return;
    const supabase = createClient();

    // Mark online
    supabase.rpc('update_user_presence', { p_user_id: currentUserId, p_is_online: true });

    // Mark offline on unload
    const markOffline = () => {
      supabase.rpc('update_user_presence', { p_user_id: currentUserId, p_is_online: false });
    };

    window.addEventListener('beforeunload', markOffline);
    // Also handle visibility change
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        markOffline();
      } else {
        supabase.rpc('update_user_presence', { p_user_id: currentUserId, p_is_online: true });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      markOffline();
      window.removeEventListener('beforeunload', markOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentUserId]);

  // Subscribe to profiles online status changes
  useEffect(() => {
    if (!currentUserId) return;
    const supabase = createClient();

    const channel = supabase
      .channel('presence-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: 'is_online=eq.true' },
        (payload) => {
          const userId = (payload.new as { id: string }).id;
          setOnlineUsers(prev => new Set(prev).add(userId));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: 'is_online=eq.false' },
        (payload) => {
          const userId = (payload.new as { id: string }).id;
          setOnlineUsers(prev => {
            const next = new Set(prev);
            next.delete(userId);
            return next;
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  // Bulk set online users (from conversation load)
  const setOnline = useCallback((userIds: string[]) => {
    setOnlineUsers(new Set(userIds));
  }, []);

  const isOnline = useCallback((userId: string) => {
    return onlineUsers.has(userId);
  }, [onlineUsers]);

  return { onlineUsers, isOnline, setOnline };
}

/**
 * Format last seen time in Instagram style
 */
export function formatLastSeen(lastSeenAt: string | null, isOnline: boolean): string {
  if (isOnline) return 'Active now';
  if (!lastSeenAt) return '';

  const now = new Date();
  const last = new Date(lastSeenAt);
  const diffMs = now.getTime() - last.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Active just now';
  if (diffMins < 60) return `Active ${diffMins}m ago`;
  if (diffHours < 24) return `Active ${diffHours}h ago`;
  if (diffDays === 1) return 'Active yesterday';
  if (diffDays < 7) return `Active ${diffDays}d ago`;
  return '';
}

/**
 * Format time in compact Instagram style for conversation list
 */
export function formatCompactTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
