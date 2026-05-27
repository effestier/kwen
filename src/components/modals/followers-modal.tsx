'use client';

import { useState, useEffect, useRef } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/design-system/skeleton';
import Link from 'next/link';

interface FollowUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  is_following?: boolean;
}

interface FollowersModalProps {
  userId: string;
  type: 'followers' | 'following';
  onClose: () => void;
}

export function FollowersModal({ userId, type, onClose }: FollowersModalProps) {
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    async function loadUsers() {
      if (type === 'followers') {
        const { data: follows } = await supabase
          .from('follows')
          .select('follower_id, created_at')
          .eq('following_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (follows && follows.length > 0) {
          const followerIds = follows.map(f => f.follower_id);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url, bio')
            .in('id', followerIds);

          // Check if current user follows them
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: currentFollows } = await supabase
              .from('follows')
              .select('following_id')
              .eq('follower_id', user.id)
              .in('following_id', followerIds);

            const followingSet = new Set(currentFollows?.map(f => f.following_id) || []);

            setUsers(profiles?.map(p => ({
              ...p,
              is_following: followingSet.has(p.id),
            })) || []);
          } else {
            setUsers(profiles || []);
          }
        }
      } else {
        // following
        const { data: follows } = await supabase
          .from('follows')
          .select('following_id, created_at')
          .eq('follower_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (follows && follows.length > 0) {
          const followingIds = follows.map(f => f.following_id);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url, bio')
            .in('id', followingIds);

          // Check if current user follows them
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: currentFollows } = await supabase
              .from('follows')
              .select('following_id')
              .eq('follower_id', user.id)
              .in('following_id', followingIds);

            const followingSet = new Set(currentFollows?.map(f => f.following_id) || []);

            setUsers(profiles?.map(p => ({
              ...p,
              is_following: followingSet.has(p.id),
            })) || []);
          } else {
            setUsers(profiles || []);
          }
        }
      }

      setLoading(false);
    }

    loadUsers();
  }, [userId, type]);

  const handleFollow = async (targetUserId: string, currentlyFollowing: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id === targetUserId) return;

    // Optimistic update
    setUsers(prev => prev.map(u =>
      u.id === targetUserId ? { ...u, is_following: !currentlyFollowing } : u
    ));

    try {
      if (currentlyFollowing) {
        const { data: existing } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', targetUserId)
          .single();

        if (existing) {
          await supabase.from('follows').delete().eq('id', existing.id);
        }
      } else {
        await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: targetUserId });
      }
    } catch {
      // Revert on error
      setUsers(prev => prev.map(u =>
        u.id === targetUserId ? { ...u, is_following: currentlyFollowing } : u
      ));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 animate-fadeIn" onClick={onClose} />
      <div className="relative w-full sm:max-w-md max-h-[85vh] bg-[var(--bg-primary)] sm:rounded-2xl rounded-t-2xl overflow-hidden animate-slideInUp sm:animate-scaleIn">
        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-2 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-[var(--border-subtle)]" />
        </div>

        <div className="p-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {type === 'followers' ? 'Followers' : 'Following'}
          </h2>
          <button
            onClick={onClose}
            className="p-2.5 -mr-1 rounded-full hover:bg-[var(--bg-tertiary)] active:scale-95 transition-transform"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto max-h-[65vh] pb-[env(safe-area-inset-bottom)]">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton variant="circular" width={40} height={40} />
                  <div className="flex-1 space-y-1">
                    <Skeleton variant="text" width="40%" />
                    <Skeleton variant="text" width="25%" />
                  </div>
                </div>
              ))}
            </div>
          ) : users.length > 0 ? (
            <div className="divide-y divide-[var(--border-subtle)]">
              {users.map((u) => (
                <div key={u.id} className="flex items-center gap-3 p-3 active:bg-[var(--bg-tertiary)]">
                  <Link
                    href={`/profile/${u.username}`}
                    onClick={onClose}
                    className="shrink-0"
                  >
                    <Avatar src={u.avatar_url} name={u.display_name} size="md" />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/profile/${u.username}`}
                      onClick={onClose}
                      className="block"
                    >
                      <p className="font-semibold text-[var(--text-primary)] truncate">{u.display_name}</p>
                      <p className="text-sm text-[var(--text-muted)] truncate">@{u.username}</p>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-[var(--text-muted)]">
              {type === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}