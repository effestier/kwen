'use client';

import { useState, useEffect } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
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
  const supabase = createClient();

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

    // Update local state
    setUsers(prev => prev.map(u =>
      u.id === targetUserId ? { ...u, is_following: !currentlyFollowing } : u
    ));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[80vh] bg-[var(--bg-secondary)] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            {type === 'followers' ? 'Followers' : 'Following'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--bg-tertiary)]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="p-8 text-center text-[var(--text-muted)]">Loading...</div>
          ) : users.length > 0 ? (
            <div className="divide-y divide-[var(--border-subtle)]">
              {users.map((u) => (
                <div key={u.id} className="flex items-center gap-3 p-3 hover:bg-[var(--bg-tertiary)]">
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
                      <p className="font-semibold text-white truncate">{u.display_name}</p>
                      <p className="text-sm text-[var(--text-muted)] truncate">@{u.username}</p>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-[var(--text-muted)]">
              {type === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}