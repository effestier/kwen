'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/avatar';
import Link from 'next/link';

interface SuggestedUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  follower_count: number;
  reason: string;
}

export function SuggestedUsers() {
  const [users, setUsers] = useState<SuggestedUser[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.rpc('get_suggested_users', {
        p_user_id: user.id,
        p_limit: 10,
      });
      if (error) {
        if (process.env.NODE_ENV === 'development') console.warn('[SUGGESTED_USERS] RPC error:', error.message);
        return;
      }
      if (data) setUsers(data);
    }
    load();
  }, []);

  const handleFollow = useCallback(async (userId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setFollowingIds(prev => new Set(prev).add(userId));

    const { error } = await supabase
      .from('follows')
      .insert({ follower_id: user.id, following_id: userId });

    if (error) {
      setFollowingIds(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }, [supabase]);

  if (users.length === 0) return null;

  return (
    <div className="py-3 border-b border-[var(--border-subtle)]">
      <h3 className="text-sm font-semibold text-[var(--text-muted)] px-4 mb-2">Suggested for you</h3>
      <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-1" style={{ scrollbarWidth: 'none' }}>
        {users.map((u) => {
          const isFollowing = followingIds.has(u.id);
          return (
            <div key={u.id} className="flex-shrink-0 w-36 flex flex-col items-center gap-2 p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <Link href={`/profile/${u.username}`}>
                <Avatar src={u.avatar_url} name={u.display_name} size="lg" />
              </Link>
              <div className="text-center min-w-0 w-full">
                <Link href={`/profile/${u.username}`} className="block text-sm font-semibold text-[var(--text-primary)] truncate">
                  {u.display_name}
                </Link>
                <p className="text-xs text-[var(--text-muted)] truncate">@{u.username}</p>
              </div>
              <button
                onClick={() => handleFollow(u.id)}
                disabled={isFollowing}
                className={`w-full py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isFollowing
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                    : 'bg-[var(--text-primary)] text-[var(--text-inverse)] hover:opacity-90 active:scale-95'
                }`}
              >
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
