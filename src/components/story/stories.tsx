'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Avatar } from '@/components/ui/avatar';
import { uploadStory } from '@/app/actions/media';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { uploadMedia } from '@/lib/media';

const StoryViewer = dynamic(() => import('./story-viewer').then(mod => ({ default: mod.StoryViewer })), {
  loading: () => null,
  ssr: false,
});

interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  expires_at: string;
  created_at: string;
  user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
  hasViewed: boolean;
}

interface StoriesProps {
  stories: Story[];
  currentUser?: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  onUploadSuccess?: () => void;
}

export function Stories({ stories, currentUser, onUploadSuccess }: StoriesProps) {
  const router = useRouter();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const showToast = useCallback((message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // Get current user's stories
  const myStories = useMemo(() => stories.filter(s => s.user_id === currentUser?.id), [stories, currentUser?.id]);

  // Get other users' stories (grouped by user - latest story per user)
  const otherStories = useMemo(() => stories.filter(s => s.user_id !== currentUser?.id), [stories, currentUser?.id]);

  const storiesByUser = useMemo(() => {
    const map = new Map<string, Story>();
    otherStories.forEach(story => {
      if (!map.has(story.user_id)) {
        map.set(story.user_id, story);
      }
    });
    return map;
  }, [otherStories]);

  // Sort: own stories first (newest), then unseen users (newest), then seen users (newest)
  const allStoriesSorted = useMemo(() => {
    const own = [...myStories].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    const otherEntries = Array.from(storiesByUser.values())
    const unseen = otherEntries.filter(s => !s.hasViewed).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    const seen = otherEntries.filter(s => s.hasViewed).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    return [...own, ...unseen, ...seen]
  }, [myStories, storiesByUser]);

  // Build user-grouped data for viewer (Instagram model)
  const groupedUsers = useMemo(() => {
    const userMap = new Map<string, {
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      isVerified: boolean;
      stories: Story[];
    }>();

    for (const story of allStoriesSorted) {
      if (!userMap.has(story.user_id)) {
        userMap.set(story.user_id, {
          userId: story.user_id,
          username: story.user.username,
          displayName: story.user.display_name,
          avatarUrl: story.user.avatar_url,
          isVerified: story.user.is_verified,
          stories: [],
        });
      }
      userMap.get(story.user_id)!.stories.push(story);
    }

    // H22: Sort each user's stories chronologically (oldest first) for viewer playback order
    for (const user of userMap.values()) {
      user.stories.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    }

    return Array.from(userMap.values());
  }, [allStoriesSorted]);

  const [viewerUserIndex, setViewerUserIndex] = useState(0);

  const handleUserClick = (userIndex: number) => {
    setViewerUserIndex(userIndex);
    setViewerOpen(true);
  };

  const handleAddStory = () => {
    router.push('/stories/create');
  };

  const handleMyStoryClick = () => {
    if (myStories.length > 0) {
      // Own user is always index 0 in groupedUsers
      const myIndex = groupedUsers.findIndex(u => u.userId === currentUser?.id);
      if (myIndex !== -1) {
        setViewerUserIndex(myIndex);
        setViewerOpen(true);
      }
    } else {
      handleAddStory();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file || !currentUser) {
      return;
    }

    setIsUploading(true);

    try {
      // Upload with compression
      const result = await uploadMedia(file, undefined, 'story');

      // Create story record
      const mediaType = result.duration ? 'video' : 'image';
      const storyResult = await uploadStory(result.url, mediaType);

      if (storyResult.error) {
        console.error('Failed to create story:', storyResult.error);
        showToast(`Story upload failed: ${storyResult.error}`);
      } else {
        showToast('Story posted!', 'success');
        onUploadSuccess?.();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown upload error';
      console.error('Story upload error:', err);
      showToast(message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Check if current user has unviewed stories (for ring styling)
  const hasUnviewedMyStory = myStories.some(s => !s.hasViewed);

  return (
    <>
      <div className="flex gap-3.5 overflow-x-auto scrollbar-hide -mx-4 px-4 py-0.5">
        {/* My Story button - only show if logged in */}
        {currentUser && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            whileTap={{ scale: 0.92 }}
            onClick={handleMyStoryClick}
            disabled={isUploading}
            className="flex flex-col items-center gap-1 flex-shrink-0"
          >
            <div className="relative">
              <div
                className={cn(
                  'w-14 h-14 rounded-full p-0.5',
                  hasUnviewedMyStory
                    ? 'bg-gradient-to-br from-white via-gray-300 to-gray-500'
                    : myStories.length > 0
                      ? 'bg-[var(--border-subtle)]'
                      : 'bg-[var(--border-subtle)]'
                )}
              >
                <div className="w-full h-full rounded-full p-0.5 bg-[var(--bg-primary)] overflow-hidden">
                  <Avatar
                    src={currentUser.avatar_url}
                    name={currentUser.display_name}
                    size="xl"
                    className="w-full h-full"
                  />
                </div>
              </div>
              {/* Add icon — only show when no active story */}
              {myStories.length === 0 && (
                <div className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-white flex items-center justify-center border-2 border-[var(--bg-primary)] shadow-[0_0_8px_rgba(255,255,255,0.3)]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" /><path d="M12 5v14" />
                  </svg>
                </div>
              )}
            </div>
            <span className="text-[11px] text-[var(--text-muted)] max-w-[62px] truncate text-center">
              {myStories.length > 0 ? 'My story' : 'Add story'}
            </span>
          </motion.button>
        )}

        {/* Other users' stories (grouped) */}
        {groupedUsers
          .filter(u => u.userId !== currentUser?.id)
          .map((user) => {
            const idx = groupedUsers.indexOf(user);
            const allViewed = user.stories.every(s => s.hasViewed);
            return (
              <motion.button
                key={user.userId}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, delay: idx * 0.04, ease: [0.22, 1, 0.36, 1] }}
                whileTap={{ scale: 0.92 }}
                onClick={() => handleUserClick(idx)}
                className="flex flex-col items-center gap-1 flex-shrink-0"
              >
                <div
                  className={cn(
                    'w-[62px] h-[62px] rounded-full p-[2.5px]',
                    allViewed
                      ? 'bg-[var(--border-subtle)]'
                      : 'bg-gradient-to-br from-white via-gray-300 to-gray-500'
                  )}
                >
                  <div className="w-full h-full rounded-full p-[2px] bg-[var(--bg-primary)] overflow-hidden">
                    <Avatar
                      src={user.avatarUrl}
                      name={user.displayName}
                      size="xl"
                      className="w-full h-full"
                    />
                  </div>
                </div>
                <span className="text-[11px] text-[var(--text-muted)] max-w-[62px] truncate text-center">
                  {user.displayName.split(' ')[0]}
                </span>
              </motion.button>
            );
          })}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Toast notification */}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 max-w-sm animate-fadeInDown" style={{ top: 'max(env(safe-area-inset-top), 12px)' }}>
          {toast.type === 'error' ? (
            <div className="bg-[var(--destructive)] text-white flex items-center gap-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
              </svg>
              <span className="text-sm font-medium">{toast.message}</span>
            </div>
          ) : (
            <div className="bg-[var(--success)] text-white flex items-center gap-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span className="text-sm font-medium">{toast.message}</span>
            </div>
          )}
        </div>
      )}

      {/* Story viewer modal */}
      {viewerOpen && groupedUsers.length > 0 && (
        <StoryViewer
          users={groupedUsers}
          initialUserIndex={viewerUserIndex}
          initialStoryIndex={0}
          onClose={() => setViewerOpen(false)}
          currentUserId={currentUser?.id || ''}
        />
      )}
    </>
  );
}