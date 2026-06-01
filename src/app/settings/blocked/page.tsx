'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { getBlockedUsers, unblockUser } from '@/services/posts';

interface BlockedUser {
  id: string;
  blocked_at: string;
  profile: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
}

export default function BlockedUsersPage() {
  const router = useRouter();
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const loadBlocked = useCallback(async () => {
    const result = await getBlockedUsers();
    if (result.blocked) {
      setBlocked(result.blocked as BlockedUser[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBlocked();
  }, [loadBlocked]);

  const handleUnblock = async (userId: string) => {
    setUnblockingId(userId);
    const result = await unblockUser(userId);
    if (result.success) {
      setBlocked(prev => prev.filter(b => b.id !== userId));
    }
    setUnblockingId(null);
  };

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        <span className="text-sm">Back to Settings</span>
      </button>

      <div className="mb-5">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Blocked Accounts</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          People you&apos;ve blocked can&apos;t see your profile, posts, or stories. They won&apos;t know you blocked them.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-[var(--bg-secondary)] animate-pulse">
              <div className="w-11 h-11 rounded-full bg-[var(--bg-tertiary)]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 rounded bg-[var(--bg-tertiary)]" />
                <div className="h-3 w-16 rounded bg-[var(--bg-tertiary)]" />
              </div>
            </div>
          ))}
        </div>
      ) : blocked.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="m4.93 4.93 14.14 14.14" />
            </svg>
          </div>
          <p className="font-medium text-[var(--text-primary)]">No blocked accounts</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            When you block someone, they&apos;ll appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {blocked.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <Avatar
                src={user.profile?.avatar_url || null}
                name={user.profile?.display_name || 'User'}
                size="md"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[var(--text-primary)] text-sm truncate">
                  {user.profile?.display_name || 'Unknown User'}
                </p>
                <p className="text-xs text-[var(--text-muted)] truncate">
                  @{user.profile?.username || 'unknown'}
                </p>
              </div>
              <button
                onClick={() => handleUnblock(user.id)}
                disabled={unblockingId === user.id}
                className="px-4 py-1.5 rounded-lg text-sm font-medium bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
              >
                {unblockingId === user.id ? 'Unblocking...' : 'Unblock'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
