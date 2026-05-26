'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
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
import { hapticMedium } from '@/lib/haptics';
import { HighlightsRow } from '@/components/highlights/highlights-row';
import { getUserHighlights, getHighlightStories } from '@/services/highlights';
import type { Highlight, HighlightStory } from '@/services/highlights';

const HighlightViewer = dynamic(() => import('@/components/highlights/highlight-viewer').then(mod => ({ default: mod.HighlightViewer })), {
  loading: () => null,
  ssr: false,
});

const CreateHighlightModal = dynamic(() => import('@/components/highlights/create-highlight-modal').then(mod => ({ default: mod.CreateHighlightModal })), {
  loading: () => null,
  ssr: false,
});

const FollowersModal = dynamic(() => import('@/components/modals/followers-modal').then(mod => ({ default: mod.FollowersModal })), {
  loading: () => null,
  ssr: false,
});

const PostOwnerActionsSheet = dynamic(() => import('@/components/post/post-owner-actions').then(mod => ({ default: mod.PostOwnerActionsSheet })), {
  loading: () => null,
  ssr: false,
});

const tabs = ['posts', 'videos', 'saved'];

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
  hideLikes: boolean;
  disableComments: boolean;
}

export function ProfileClient({ username }: { username: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [stats, setStats] = useState({ posts: 0, followers: 0, following: 0 });
  const [activeTab, setActiveTab] = useState('posts');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messaging, setMessaging] = useState(false);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);

  // Highlights state
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [showHighlightViewer, setShowHighlightViewer] = useState(false);
  const [selectedHighlight, setSelectedHighlight] = useState<Highlight | null>(null);
  const [highlightStories, setHighlightStories] = useState<HighlightStory[]>([]);
  const [showCreateHighlight, setShowCreateHighlight] = useState(false);

  // Owner actions sheet state
  const [selectedOwnerPost, setSelectedOwnerPost] = useState<Post | null>(null);

  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setError(null);

        let { data: targetProfile, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, bio, is_verified')
          .eq('username', username)
          .single();

        if (profileError || !targetProfile) {
          // Profile not found — check if it's the logged-in user's own profile
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            const { data: ownProfile } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url, bio, is_verified')
              .eq('id', authUser.id)
              .single();

            if (ownProfile) {
              if (ownProfile.username !== username) {
                // Username doesn't match — show "not found" instead of silent redirect
                if (!cancelled) {
                  setError('User not found');
                  setLoading(false);
                }
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
                  if (!cancelled) {
                    setError('User not found');
                    setLoading(false);
                  }
                  return;
                }
                targetProfile = newProfile;
              }
            }
          }

          if (!targetProfile) {
            if (!cancelled) {
              setError('User not found');
              setLoading(false);
            }
            return;
          }
        }

        if (cancelled) return;
        setProfile(targetProfile);

        const { data: { user: authUser } } = await supabase.auth.getUser();

        if (authUser) {
          const { data: currentProfile } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url, bio, is_verified')
            .eq('id', authUser.id)
            .single();

          if (cancelled) return;
          setCurrentUser(currentProfile);

          if (targetProfile.id !== authUser.id) {
            const { data: follow } = await supabase
              .from('follows')
              .select('id')
              .eq('follower_id', authUser.id)
              .eq('following_id', targetProfile.id)
              .single();

            if (cancelled) return;
            setIsFollowing(!!follow);
          }
        }

        const [{ count: postsCount }, { count: followersCount }, { count: followingCount }] = await Promise.all([
          supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', targetProfile.id).is('deleted_at', null).is('archived_at', null),
          supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', targetProfile.id),
          supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', targetProfile.id),
        ]);

        if (cancelled) return;
        setStats({
          posts: postsCount || 0,
          followers: followersCount || 0,
          following: followingCount || 0,
        });

        // Load highlights
        const userHighlights = await getUserHighlights(targetProfile.id);
        if (!cancelled) setHighlights(userHighlights);

        const { data: userPosts } = await supabase
          .from('posts')
          .select('id, user_id, content, location, created_at, hide_likes, disable_comments')
          .eq('user_id', targetProfile.id)
          .is('deleted_at', null)
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .limit(9);

        if (cancelled) return;

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

          if (!cancelled) {
            setPosts(userPosts.map(p => ({
              id: p.id,
              content: p.content,
              images: mediaMap.get(p.id) ? [mediaMap.get(p.id)!] : [],
              likes: likesMap.get(p.id) || 0,
              comments: commentsMap.get(p.id) || 0,
              hideLikes: p.hide_likes ?? false,
              disableComments: p.disable_comments ?? false,
            })));
          }
        } else {
          if (!cancelled) setPosts([]);
        }

        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) {
          setError('Failed to load profile');
          setLoading(false);
        }
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [username, supabase]);

  const handleFollow = async () => {
    if (!profile || !currentUser) return;

    // M31: Use functional setState to avoid stale closure on rapid clicks
    setIsFollowing(prev => {
      if (!prev) hapticMedium();
      return !prev;
    });
    const wasFollowing = isFollowing;
    setStats(prev => ({
      ...prev,
      followers: wasFollowing ? prev.followers - 1 : prev.followers + 1,
    }));

    try {
      await toggleFollow(profile.id);
    } catch {
      setIsFollowing(wasFollowing);
      setStats(prev => ({
        ...prev,
        followers: wasFollowing ? prev.followers + 1 : prev.followers - 1,
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
        <div className="max-w-2xl mx-auto px-4 py-3 space-y-3">
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

  if (error) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <p className="text-[var(--text-muted)] mb-4">{error}</p>
            <button
              onClick={() => router.push('/feed')}
              className="px-4 py-2 bg-[var(--accent-primary)] text-[var(--text-inverse)] rounded-lg text-sm font-medium"
            >
              Go to Feed
            </button>
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
        {/* Profile header — centered layout */}
        <div className="px-5 pt-5 pb-2">
          {/* Avatar — centered */}
          <div className="flex justify-center mb-3">
            <div className="w-20 h-20 rounded-full bg-[var(--bg-secondary)] overflow-hidden ring-2 ring-[var(--border-subtle)] ring-offset-2 ring-offset-[var(--bg-primary)]">
              <Avatar
                src={profile.avatar_url}
                name={profile.display_name}
                size="2xl"
                className="w-full h-full"
              />
            </div>
          </div>

          {/* Name — centered */}
          <div className="text-center mb-1">
            <div className="flex items-center justify-center gap-1">
              <h2 className="text-base font-bold text-[var(--text-primary)]">{profile.display_name}</h2>
              {profile.is_verified && (
                <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              )}
            </div>
            <p className="text-[13px] text-[var(--text-muted)] mt-0.5">@{profile.username}</p>
          </div>

          {/* Bio */}
          {profile.bio && (
            <p className="text-[14px] text-[var(--text-secondary)] text-center leading-snug whitespace-pre-line mt-2 max-w-[280px] mx-auto">{profile.bio}</p>
          )}

          {/* Stats — horizontal row */}
          <div className="flex items-center justify-center gap-6 mt-3 py-2.5 rounded-xl bg-[var(--bg-secondary)]">
            <div className="text-center">
              <div className="text-[15px] font-bold text-[var(--text-primary)] leading-tight">{formatNumber(stats.posts)}</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5 uppercase tracking-wide">posts</div>
            </div>
            <div className="w-px h-6 bg-[var(--border-subtle)]" />
            <button onClick={() => setShowFollowers(true)} className="text-center">
              <div className="text-[15px] font-bold text-[var(--text-primary)] leading-tight">{formatNumber(stats.followers)}</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5 uppercase tracking-wide">followers</div>
            </button>
            <div className="w-px h-6 bg-[var(--border-subtle)]" />
            <button onClick={() => setShowFollowing(true)} className="text-center">
              <div className="text-[15px] font-bold text-[var(--text-primary)] leading-tight">{formatNumber(stats.following)}</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5 uppercase tracking-wide">following</div>
            </button>
          </div>

          {/* Action buttons */}
          {isLoggedIn && (
            <div className="mt-3 flex gap-2">
              {isOwnProfile ? (
                <Link href="/settings" className="flex-1 text-center py-[7px] rounded-xl bg-[var(--bg-tertiary)] text-[13px] font-semibold text-[var(--text-primary)] active:opacity-70 transition-opacity">
                  Edit profile
                </Link>
              ) : (
                <>
                  <button
                    onClick={handleFollow}
                    className={cn(
                      'flex-1 py-[7px] rounded-xl text-[13px] font-semibold active:opacity-70 transition-opacity',
                      isFollowing
                        ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                        : 'bg-[var(--accent-primary)] text-[var(--text-inverse)]'
                    )}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                  <button
                    onClick={handleMessage}
                    disabled={messaging}
                    className="flex-1 py-[7px] rounded-xl bg-[var(--bg-tertiary)] text-[13px] font-semibold text-[var(--text-primary)] active:opacity-70 transition-opacity disabled:opacity-40"
                  >
                    {messaging ? '...' : 'Message'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Highlights */}
        {(highlights.length > 0 || isOwnProfile) && (
          <div className="pt-2 pb-1">
            <HighlightsRow
              highlights={highlights}
              isOwnProfile={isOwnProfile}
              onHighlightClick={async (highlight) => {
                setSelectedHighlight(highlight);
                const stories = await getHighlightStories(highlight.id);
                setHighlightStories(stories);
                setShowHighlightViewer(true);
              }}
              onCreateHighlight={() => {
                setShowCreateHighlight(true);
              }}
            />
          </div>
        )}

        {/* Tab bar — segmented style */}
        <div role="tablist" aria-label="Profile sections" className="flex mx-4 mt-1 mb-0 p-0.5 rounded-lg bg-[var(--bg-secondary)]">
          {tabs.map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex-1 py-1.5 text-[12px] font-semibold capitalize rounded-md transition-all',
                activeTab === tab
                  ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)]'
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Posts grid */}
        <div>
          {activeTab === 'posts' && (
            posts.length > 0 ? (
              <div className="grid grid-cols-3 gap-[2px] mt-1">
                {posts.map((post) => (
                  isOwnProfile ? (
                    <button
                      key={post.id}
                      onClick={() => setSelectedOwnerPost(post)}
                      className="aspect-square bg-[var(--bg-secondary)] relative group block focus:outline-none cursor-pointer"
                    >
                      {post.images?.[0] ? (
                        <img src={post.images[0]} alt={`Post by ${profile.display_name}`} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-2">
                          <p className="text-xs text-[var(--text-muted)] text-center line-clamp-3">{post.content}</p>
                        </div>
                      )}
                      <div aria-hidden="true" className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
                        </svg>
                      </div>
                    </button>
                  ) : (
                    <Link key={post.id} href={`/post/${post.id}`} className="aspect-square bg-[var(--bg-secondary)] relative group block focus:outline-none cursor-pointer">
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
                  )
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-[var(--text-muted)]">No posts yet</p>
              </div>
            )
          )}
          {activeTab === 'videos' && (
            <div className="text-center py-12">
              <p className="text-[var(--text-muted)]">No videos yet</p>
            </div>
          )}
          {activeTab === 'saved' && (
            <div className="text-center py-12">
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

      {/* Highlight viewer */}
      {showHighlightViewer && selectedHighlight && highlightStories.length > 0 && (
        <HighlightViewer
          highlightId={selectedHighlight.id}
          highlightTitle={selectedHighlight.title}
          stories={highlightStories}
          onClose={() => {
            setShowHighlightViewer(false);
            setSelectedHighlight(null);
            setHighlightStories([]);
          }}
          isOwner={isOwnProfile}
          onStoriesChanged={(updated) => setHighlightStories(updated)}
          onDeleted={() => {
            setHighlights(prev => prev.filter(h => h.id !== selectedHighlight.id));
            setShowHighlightViewer(false);
            setSelectedHighlight(null);
            setHighlightStories([]);
          }}
        />
      )}

      {/* Create highlight modal */}
      {showCreateHighlight && (
        <CreateHighlightModal
          onClose={() => setShowCreateHighlight(false)}
          onSuccess={async (highlightId) => {
            setShowCreateHighlight(false);
            // Refresh highlights list
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const updated = await getUserHighlights(user.id);
              setHighlights(updated);
            }
          }}
        />
      )}

      {/* Owner actions sheet */}
      {selectedOwnerPost && (
        <PostOwnerActionsSheet
          postId={selectedOwnerPost.id}
          hideLikes={selectedOwnerPost.hideLikes}
          disableComments={selectedOwnerPost.disableComments}
          onClose={() => setSelectedOwnerPost(null)}
          onDeleted={() => {
            setPosts(prev => prev.filter(p => p.id !== selectedOwnerPost.id));
            setStats(prev => ({ ...prev, posts: prev.posts - 1 }));
            setSelectedOwnerPost(null);
          }}
          onUpdated={(updates) => {
            if (updates.archived) {
              setPosts(prev => prev.filter(p => p.id !== selectedOwnerPost.id));
              setStats(prev => ({ ...prev, posts: prev.posts - 1 }));
              setSelectedOwnerPost(null);
            } else {
              setPosts(prev => prev.map(p => p.id !== selectedOwnerPost.id ? p : {
                ...p,
                hideLikes: updates.hideLikes ?? p.hideLikes,
                disableComments: updates.disableComments ?? p.disableComments,
              }));
            }
          }}
        />
      )}
    </MainLayout>
  );
}
