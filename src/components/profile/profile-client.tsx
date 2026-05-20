'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { Avatar } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/design-system/skeleton';
import Link from 'next/link';
import { toggleFollow } from '@/services/follows';
import { getOrCreateConversation } from '@/services/messages';
import { useRouter } from 'next/navigation';
import { FollowersModal } from '@/components/modals/followers-modal';

const tabs = ['posts', 'reels', 'likes', 'saved'];

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
}

interface Post {
  id: string;
  content: string | null;
  images: string[];
  likes: number;
  comments: number;
}

export function ProfileClient({ username }: { username: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [stats, setStats] = useState({ posts: 0, followers: 0, following: 0 });
  const [activeTab, setActiveTab] = useState('posts');
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(false);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      let { data: targetProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio, is_verified')
        .eq('username', username)
        .single();

      if (profileError || !targetProfile) {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const { data: ownProfile } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url, bio, is_verified')
            .eq('id', authUser.id)
            .single();

          if (ownProfile) {
            if (ownProfile.username !== username) {
              window.location.replace(`/profile/${ownProfile.username}`);
              return;
            }
            targetProfile = ownProfile;
          } else {
            const tempUsername = `user_${authUser.id.slice(0, 8)}`;
            const { data: newProfile } = await supabase
              .from('profiles')
              .upsert({
                id: authUser.id,
                username: tempUsername,
                display_name: authUser.email?.split('@')[0] || 'User',
              }, { onConflict: 'id' })
              .select('id, username, display_name, avatar_url, bio, is_verified')
              .single();

            if (newProfile) {
              if (newProfile.username !== username) {
                window.location.replace(`/profile/${newProfile.username}`);
                return;
              }
              targetProfile = newProfile;
            }
          }
        }

        if (!targetProfile) {
          setLoading(false);
          return;
        }
      }

      setProfile(targetProfile);

      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (authUser) {
        const { data: currentProfile } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, bio, is_verified')
          .eq('id', authUser.id)
          .single();

        setCurrentUser(currentProfile);

        if (targetProfile.id !== authUser.id) {
          const { data: follow } = await supabase
            .from('follows')
            .select('id')
            .eq('follower_id', authUser.id)
            .eq('following_id', targetProfile.id)
            .single();

          setIsFollowing(!!follow);
        }
      }

      const [{ count: postsCount }, { count: followersCount }, { count: followingCount }] = await Promise.all([
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', targetProfile.id).is('deleted_at', null),
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', targetProfile.id),
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', targetProfile.id),
      ]);

      setStats({
        posts: postsCount || 0,
        followers: followersCount || 0,
        following: followingCount || 0,
      });

      const { data: userPosts } = await supabase
        .from('posts')
        .select('id, user_id, content, location, created_at')
        .eq('user_id', targetProfile.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(9);

      if (userPosts && userPosts.length > 0) {
        const postIds = userPosts.map(p => p.id);

        const { data: media } = await supabase
          .from('post_media')
          .select('post_id, storage_path, sort_order')
          .in('post_id', postIds)
          .order('sort_order', { ascending: true });

        const mediaMap = new Map<string, string>();
        media?.forEach(m => {
          if (!mediaMap.has(m.post_id)) {
            mediaMap.set(m.post_id, m.storage_path);
          }
        });

        const [{ data: likes }, { data: comments }] = await Promise.all([
          supabase.from('post_likes').select('post_id').in('post_id', postIds),
          supabase.from('comments').select('post_id').in('post_id', postIds),
        ]);

        const likesMap = new Map<string, number>();
        likes?.forEach(l => {
          likesMap.set(l.post_id, (likesMap.get(l.post_id) || 0) + 1);
        });

        const commentsMap = new Map<string, number>();
        comments?.forEach(c => {
          commentsMap.set(c.post_id, (commentsMap.get(c.post_id) || 0) + 1);
        });

        setPosts(userPosts.map(p => ({
          id: p.id,
          content: p.content,
          images: mediaMap.get(p.id) ? [mediaMap.get(p.id)!] : [],
          likes: likesMap.get(p.id) || 0,
          comments: commentsMap.get(p.id) || 0,
        })));
      } else {
        setPosts([]);
      }

      setLoading(false);
    }

    loadData();
  }, [username]);

  const handleFollow = async () => {
    if (!profile || !currentUser) return;

    setIsFollowing(!isFollowing);
    setStats(prev => ({
      ...prev,
      followers: isFollowing ? prev.followers - 1 : prev.followers + 1,
    }));

    try {
      await toggleFollow(profile.id);
    } catch {
      setIsFollowing(isFollowing);
      setStats(prev => ({
        ...prev,
        followers: isFollowing ? prev.followers + 1 : prev.followers - 1,
      }));
    }
  };

  const handleMessage = async () => {
    if (!profile || messaging) return;

    setMessaging(true);
    const result = await getOrCreateConversation(profile.id);

    if (result.conversationId) {
      router.push('/messages');
    } else {
      alert('Failed to start conversation: ' + (result.error || 'Unknown error'));
    }
    setMessaging(false);
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton variant="circular" width={80} height={80} />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" width="40%" />
              <Skeleton variant="text" width="25%" />
            </div>
          </div>
          <Skeleton variant="text" width="60%" />
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!profile) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-[var(--text-muted)]">User not found</div>
        </div>
      </MainLayout>
    );
  }

  const isOwnProfile = currentUser?.id === profile.id;
  const isLoggedIn = !!currentUser;

  return (
    <MainLayout>
      <div className="min-h-screen">
        <div className="h-32 md:h-48 bg-gradient-to-r from-[var(--accent-primary)]/20 via-[var(--accent-secondary)]/20 to-[var(--accent-blue)]/20" />

        <div className="px-4 pb-4">
          <div className="flex items-start justify-between -mt-12 mb-3">
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-[var(--bg-secondary)] border-4 border-[var(--bg-primary)] overflow-hidden">
              <Avatar
                src={profile.avatar_url}
                name={profile.display_name}
                size="2xl"
                className="w-full h-full"
              />
            </div>
            {isLoggedIn ? (
              isOwnProfile ? (
                <Link href="/settings" className="px-4 py-1.5 rounded-full border border-[var(--border-soft)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors-fast">
                  Edit profile
                </Link>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleFollow}
                    className={cn(
                      'px-4 py-1.5 rounded-full text-sm font-semibold transition-colors-fast',
                      isFollowing
                        ? 'border border-[var(--border-soft)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                        : 'bg-[var(--accent-primary)] text-white hover:opacity-90'
                    )}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                  <button
                    onClick={handleMessage}
                    disabled={messaging}
                    className="px-4 py-1.5 rounded-full border border-[var(--border-soft)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors-fast disabled:opacity-50"
                  >
                    {messaging ? '...' : 'Message'}
                  </button>
                </div>
              )
            ) : null}
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <h1 className="text-xl font-bold text-[var(--text-primary)]">{profile.display_name}</h1>
              {profile.is_verified && (
                <svg aria-label="Verified" className="w-5 h-5 text-[var(--accent-blue)]" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-3">@{profile.username}</p>
          </div>

          {profile.bio && (
            <p className="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">{profile.bio}</p>
          )}

          <div className="flex items-center gap-4 text-sm mb-4">
            <span>
              <span className="font-bold text-[var(--text-primary)]">{formatNumber(stats.posts)}</span>
              <span className="text-[var(--text-muted)]"> posts</span>
            </span>
            <button
              onClick={() => setShowFollowers(true)}
              className="hover:underline"
            >
              <span className="font-bold text-[var(--text-primary)]">{formatNumber(stats.followers)}</span>
              <span className="text-[var(--text-muted)]"> followers</span>
            </button>
            <button
              onClick={() => setShowFollowing(true)}
              className="hover:underline"
            >
              <span className="font-bold text-[var(--text-primary)]">{formatNumber(stats.following)}</span>
              <span className="text-[var(--text-muted)]"> following</span>
            </button>
          </div>
        </div>

        <div role="tablist" aria-label="Profile sections" className="flex border-t border-b border-[var(--border-subtle)]">
          {tabs.map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex-1 py-3.5 text-sm font-semibold capitalize transition-colors-fast relative',
                activeTab === tab ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
              )}
            >
              {tab}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--text-primary)]" />
              )}
            </button>
          ))}
        </div>

        <div>
          {activeTab === 'posts' && (
            posts.length > 0 ? (
              <div className="grid grid-cols-3 gap-0.5">
                {posts.map((post) => (
                  <Link key={post.id} href={`/post/${post.id}`} className="aspect-square bg-[var(--bg-secondary)] relative group block focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-inset cursor-pointer">
                    {post.images?.[0] ? (
                      <img src={post.images[0]} alt={`Post by ${profile.display_name}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-2">
                        <p className="text-xs text-[var(--text-muted)] text-center line-clamp-3">{post.content}</p>
                      </div>
                    )}
                    <div aria-hidden="true" className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-4 text-white text-sm">
                      <span>♥ {formatNumber(post.likes)}</span>
                      <span>💬 {formatNumber(post.comments)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <p className="text-[var(--text-muted)]">No posts yet</p>
              </div>
            )
          )}
          {activeTab === 'reels' && (
            <div className="text-center py-20">
              <p className="text-[var(--text-muted)]">No reels yet</p>
            </div>
          )}
          {activeTab === 'likes' && (
            <div className="text-center py-20">
              <p className="text-[var(--text-muted)]">No liked posts yet</p>
            </div>
          )}
          {activeTab === 'saved' && (
            <div className="text-center py-20">
              <p className="text-[var(--text-muted)]">No saved posts yet</p>
            </div>
          )}
        </div>
      </div>

      {showFollowers && profile && (
        <FollowersModal
          userId={profile.id}
          type="followers"
          onClose={() => setShowFollowers(false)}
        />
      )}

      {showFollowing && profile && (
        <FollowersModal
          userId={profile.id}
          type="following"
          onClose={() => setShowFollowing(false)}
        />
      )}
    </MainLayout>
  );
}
