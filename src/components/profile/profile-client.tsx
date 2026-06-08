'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { MainLayout } from '@/components/layout/main-layout';
import { Avatar } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { ProfileSkeleton, GridSkeleton } from '@/components/design-system/skeleton';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import Link from 'next/link';
import { toggleFollow } from '@/services/follows';
import { blockUser, muteUser } from '@/services/posts';
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

export function ProfileClient({ username, currentUserProfile }: { username: string; currentUserProfile?: { id: string; username: string; display_name: string; avatar_url: string | null } | null }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [savedLoaded, setSavedLoaded] = useState(false);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [stats, setStats] = useState({ posts: 0, followers: 0, following: 0 });
  const [activeTab, setActiveTab] = useState('posts');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messaging, setMessaging] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [profileMenuToast, setProfileMenuToast] = useState<string | null>(null);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);

  // Highlights state
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [showHighlightViewer, setShowHighlightViewer] = useState(false);
  const [selectedHighlight, setSelectedHighlight] = useState<Highlight | null>(null);
  const [highlightStories, setHighlightStories] = useState<HighlightStory[]>([]);
  const [showCreateHighlight, setShowCreateHighlight] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  // Owner actions sheet state
  const [selectedOwnerPost, setSelectedOwnerPost] = useState<Post | null>(null);

  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
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

        // Show shell immediately — everything else loads in background
        setLoading(false);

        const { data: { user: authUser } } = await supabase.auth.getUser();

        // Parallel: auth profile, follow status, counts, highlights, posts
        const promises: Promise<unknown>[] = [
          supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', targetProfile.id).is('deleted_at', null).is('archived_at', null) as unknown as Promise<unknown>,
          supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', targetProfile.id) as unknown as Promise<unknown>,
          supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', targetProfile.id) as unknown as Promise<unknown>,
          getUserHighlights(targetProfile.id),
          supabase
            .from('posts')
            .select('id, user_id, content, location, created_at, hide_likes, disable_comments')
            .eq('user_id', targetProfile.id)
            .is('deleted_at', null)
            .is('archived_at', null)
            .order('created_at', { ascending: false })
            .limit(9) as unknown as Promise<unknown>,
        ];

        if (authUser) {
          promises.push(
            supabase.from('profiles').select('id, username, display_name, avatar_url, bio, is_verified').eq('id', authUser.id).single() as unknown as Promise<unknown>,
            targetProfile.id !== authUser.id
              ? supabase.from('follows').select('id').eq('follower_id', authUser.id).eq('following_id', targetProfile.id).single() as unknown as Promise<unknown>
              : Promise.resolve({ data: null }),
            // Check block status in both directions
            targetProfile.id !== authUser.id
              ? supabase.from('blocks').select('blocker_id').or(`and(blocker_id.eq.${authUser.id},blocked_id.eq.${targetProfile.id}),and(blocker_id.eq.${targetProfile.id},blocked_id.eq.${authUser.id})`).limit(1).maybeSingle() as unknown as Promise<unknown>
              : Promise.resolve({ data: null })
          );
        }

        const results = await Promise.all(promises);

        if (cancelled) return;

        const postsCount = (results[0] as any).count;
        const followersCount = (results[1] as any).count;
        const followingCount = (results[2] as any).count;
        const userHighlights = results[3] as any[];
        const userPostsResult = results[4] as any;

        setStats({
          posts: postsCount || 0,
          followers: followersCount || 0,
          following: followingCount || 0,
        });
        setHighlights(userHighlights);

        if (authUser && results.length > 5) {
          setCurrentUser((results[5] as any).data);
          if (targetProfile.id !== authUser.id) {
            setIsFollowing(!!(results[6] as any).data);
            setIsBlocked(!!(results[7] as any).data);
          }
        }

        const userPosts = userPostsResult.data;

        if (cancelled) return;

        if (userPosts && userPosts.length > 0) {
          const postIds = userPosts.map((p: any) => p.id);

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
            setPosts(userPosts.map((p: any) => ({
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

  // Load saved posts when tab is activated on own profile
  useEffect(() => {
    if (activeTab !== 'saved' || savedLoaded || !profile || !currentUser || profile.id !== currentUser.id) return;

    let cancelled = false;

    async function loadSaved() {
      const supabase2 = createClient();
      const { data: { user } } = await supabase2.auth.getUser();
      if (!user || cancelled) return;

      const { data: saved } = await supabase2
        .from('saved_posts')
        .select('post_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(18);

      if (cancelled) return;
      if (!saved || saved.length === 0) {
        setSavedLoaded(true);
        return;
      }

      const postIds = saved.map(s => s.post_id);
      const { data: dbPosts } = await supabase2
        .from('posts')
        .select('id, content, hide_likes, disable_comments, post_media(storage_path, sort_order)')
        .in('id', postIds)
        .is('deleted_at', null);

      if (cancelled) return;
      if (!dbPosts) { setSavedLoaded(true); return; }

      const { data: likes } = await supabase2.from('post_likes').select('post_id').in('post_id', postIds);
      const { data: comments } = await supabase2.from('comments').select('post_id').in('post_id', postIds);

      const likesMap = new Map<string, number>();
      likes?.forEach(l => likesMap.set(l.post_id, (likesMap.get(l.post_id) || 0) + 1));
      const commentsMap = new Map<string, number>();
      comments?.forEach(c => commentsMap.set(c.post_id, (commentsMap.get(c.post_id) || 0) + 1));

      if (!cancelled) {
        setSavedPosts(dbPosts.map((p: any) => ({
          id: p.id,
          content: p.content,
          images: (p.post_media || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)).map((m: any) => m.storage_path),
          likes: likesMap.get(p.id) || 0,
          comments: commentsMap.get(p.id) || 0,
          hideLikes: p.hide_likes ?? false,
          disableComments: p.disable_comments ?? false,
        })));
        setSavedLoaded(true);
      }
    }

    loadSaved();
    return () => { cancelled = true; };
  }, [activeTab, savedLoaded, profile, currentUser]);

  const handleFollow = async () => {
    if (!profile || !currentUser) return;

    // Use functional setState to capture the actual previous value
    let wasFollowing = false;
    setIsFollowing(prev => {
      wasFollowing = prev;
      if (!prev) hapticMedium();
      return !prev;
    });
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
    if (!profile || messaging || isBlocked) return;

    setMessaging(true);
    try {
      const result = await getOrCreateConversation(profile.id);

      if (result.error) {
        alert(result.error);
      } else if (result.conversationId) {
        router.push(`/messages?open=${result.conversationId}`);
      }
    } catch {
      alert('Could not start conversation. Please try again.');
    } finally {
      setMessaging(false);
    }
  };

  if (loading) {
    return (
      <MainLayout initialProfile={currentUserProfile}>
        <div className="p-4 space-y-6">
          <ProfileSkeleton />
          <GridSkeleton columns={3} rows={3} gap={0.5} />
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout initialProfile={currentUserProfile}>
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
      <MainLayout initialProfile={currentUserProfile}>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-[var(--text-muted)]">User not found</div>
        </div>
      </MainLayout>
    );
  }

  const isOwnProfile = currentUser?.id === profile.id;
  const isLoggedIn = !!currentUser;

  const handleRefresh = async () => {
    // Reload counts and posts
    if (!profile) return;
    const supabase2 = createClient();
    const [{ count: postsCount }, { count: followersCount }, { count: followingCount }, postsData] = await Promise.all([
      supabase2.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).is('deleted_at', null).is('archived_at', null),
      supabase2.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', profile.id),
      supabase2.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', profile.id),
      supabase2.from('posts').select('id, user_id, content, location, created_at, hide_likes, disable_comments').eq('user_id', profile.id).is('deleted_at', null).is('archived_at', null).order('created_at', { ascending: false }).limit(18),
    ]);
    setStats({ posts: postsCount || 0, followers: followersCount || 0, following: followingCount || 0 });
    if (postsData.data) {
      const postIds = postsData.data.map((p: any) => p.id);
      const [mediaRes, likesRes, commentsRes] = await Promise.all([
        supabase2.from('post_media').select('post_id, storage_path, sort_order').in('post_id', postIds),
        supabase2.from('post_likes').select('post_id').in('post_id', postIds),
        supabase2.from('comments').select('post_id').in('post_id', postIds),
      ]);
      const likesMap = new Map<string, number>();
      likesRes.data?.forEach(l => likesMap.set(l.post_id, (likesMap.get(l.post_id) || 0) + 1));
      const commentsMap = new Map<string, number>();
      commentsRes.data?.forEach(c => commentsMap.set(c.post_id, (commentsMap.get(c.post_id) || 0) + 1));
      setPosts(postsData.data.map((p: any) => ({
        id: p.id, content: p.content, user_id: p.user_id, location: p.location,
        images: (mediaRes.data || []).filter((m: any) => m.post_id === p.id).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)).map((m: any) => m.storage_path),
        likes: likesMap.get(p.id) || 0, comments: commentsMap.get(p.id) || 0,
        hideLikes: p.hide_likes ?? false, disableComments: p.disable_comments ?? false,
      })));
    }
  };

  return (
    <MainLayout>
      <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen">
        {/* Profile header — centered */}
        <div className="relative px-5 pt-5 pb-2">
          {/* Avatar centered */}
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

          {/* Name centered */}
          <div className="text-center mb-1">
            <div className="flex items-center justify-center gap-1">
              <h2 className="text-base font-bold text-[var(--text-primary)]">{profile.display_name}</h2>
              {profile.is_verified && (
                <svg className="w-4 h-4 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              )}
            </div>
            <p className="text-[13px] text-[var(--text-muted)] mt-0.5">@{profile.username}</p>
          </div>

          {/* Bio */}
          {profile.bio && (
            <p className="selectable text-[14px] text-[var(--text-secondary)] text-center leading-snug whitespace-pre-line mt-2 max-w-[280px] mx-auto">{profile.bio}</p>
          )}

          {/* Stats card */}
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
                <>
                  <Link href="/settings" className="flex-1 text-center py-2.5 rounded-xl bg-[var(--bg-tertiary)] text-[13px] font-semibold text-[var(--text-primary)] active:opacity-70 transition-opacity">
                    Edit profile
                  </Link>
                  <button
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({ title: profile?.display_name, url: window.location.href });
                      } else {
                        navigator.clipboard.writeText(window.location.href);
                      }
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-[var(--bg-tertiary)] text-[13px] font-semibold text-[var(--text-primary)] active:opacity-70 transition-opacity"
                  >
                    Share profile
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleFollow}
                    className={cn(
                      'flex-1 py-2.5 rounded-xl text-[13px] font-semibold active:opacity-70 transition-opacity',
                      isFollowing
                        ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                        : 'bg-[var(--accent-primary)] text-[var(--text-inverse)]'
                    )}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                  {!isBlocked && (
                    <button
                      onClick={handleMessage}
                      disabled={messaging}
                      className="flex-1 py-2.5 rounded-xl bg-[var(--bg-tertiary)] text-[13px] font-semibold text-[var(--text-primary)] active:opacity-70 transition-opacity disabled:opacity-40"
                    >
                      {messaging ? '...' : 'Message'}
                    </button>
                  )}
                  <button
                    onClick={() => setShowProfileMenu(!showProfileMenu)}
                    className="px-3 py-2.5 rounded-xl bg-[var(--bg-tertiary)] text-[var(--text-primary)] active:opacity-70 transition-opacity"
                    aria-label="More options"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          )}

          {/* Profile options menu */}
          {showProfileMenu && !isOwnProfile && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
              <div className="absolute right-4 top-20 z-50 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl overflow-hidden min-w-[180px] shadow-xl">
                <button onClick={() => { setShowProfileMenu(false); setProfileMenuToast('Report submitted. Thank you for keeping KWEN safe.'); setTimeout(() => setProfileMenuToast(null), 3000); }} className="w-full px-4 py-3 text-left text-sm text-[var(--destructive)] hover:bg-[var(--bg-tertiary)]">Report</button>
                <button onClick={async () => { setShowProfileMenu(false); await blockUser(profile.id); router.push('/feed'); }} className="w-full px-4 py-3 text-left text-sm text-[var(--destructive)] hover:bg-[var(--bg-tertiary)]">Block</button>
                <button onClick={async () => { setShowProfileMenu(false); await muteUser(profile.id); setProfileMenuToast(`${profile.display_name} muted`); setTimeout(() => setProfileMenuToast(null), 3000); }} className="w-full px-4 py-3 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">Mute</button>
              </div>
            </>
          )}

          {/* Toast */}
          {profileMenuToast && (
            <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[var(--bg-primary)]/90 text-[var(--text-primary)] px-4 py-2 rounded-xl text-sm font-medium shadow-lg border border-[var(--border-subtle)]">
              {profileMenuToast}
            </div>
          )}
        </div>

        {/* Highlights */}
        {(highlights.length > 0 || isOwnProfile) && (
          <div className="pt-1 pb-2">
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

        {/* Tab bar — icon + label style */}
        <div role="tablist" aria-label="Profile sections" className="flex border-t border-[var(--border-subtle)]">
          <button
            role="tab"
            aria-selected={activeTab === 'posts'}
            onClick={() => setActiveTab('posts')}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors relative',
              activeTab === 'posts' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
            {activeTab === 'posts' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--text-primary)]" />}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'videos'}
            onClick={() => setActiveTab('videos')}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors relative',
              activeTab === 'videos' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m10 9 5 3-5 3z" />
            </svg>
            {activeTab === 'videos' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--text-primary)]" />}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'saved'}
            onClick={() => setActiveTab('saved')}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors relative',
              activeTab === 'saved' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
            </svg>
            {activeTab === 'saved' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--text-primary)]" />}
          </button>
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
                      className="aspect-[4/5] bg-[var(--bg-secondary)] relative group block focus:outline-none cursor-pointer"
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
                    <Link key={post.id} href={`/post/${post.id}`} className="aspect-[4/5] bg-[var(--bg-secondary)] relative group block focus:outline-none cursor-pointer">
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
            (() => {
              if (!isOwnProfile) {
                return (
                  <div className="text-center py-12">
                    <p className="text-[var(--text-muted)]">Saved posts are private</p>
                  </div>
                );
              }
              if (!savedLoaded) {
                return (
                  <div className="grid grid-cols-3 gap-[2px] mt-1">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="aspect-[4/5] bg-[var(--bg-secondary)] animate-pulse" />
                    ))}
                  </div>
                );
              }
              if (savedPosts.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center mb-3">
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]">
                        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
                      </svg>
                    </div>
                    <p className="text-sm text-[var(--text-muted)]">Save posts to see them here</p>
                  </div>
                );
              }
              return (
                <div className="grid grid-cols-3 gap-[2px] mt-1">
                  {savedPosts.map((post) => (
                    <button
                      key={post.id}
                      onClick={() => setSelectedOwnerPost(post)}
                      className="aspect-[4/5] bg-[var(--bg-secondary)] relative group block focus:outline-none cursor-pointer"
                    >
                      {post.images?.[0] ? (
                        <img src={post.images[0]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-2">
                          <p className="text-xs text-[var(--text-muted)] text-center line-clamp-3">{post.content}</p>
                        </div>
                      )}
                      <div aria-hidden="true" className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })()
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
      </PullToRefresh>
    </MainLayout>
  );
}
