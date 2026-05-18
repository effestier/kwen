'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { StoryViewer } from './story-viewer';
import { uploadStory } from '@/app/actions/media';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

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
  const [viewerIndex, setViewerIndex] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

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

  // Combine: my stories first, then other users (sorted by creation, newest first)
  const allStoriesSorted = useMemo(() => [
    ...myStories,
    ...Array.from(storiesByUser.values())
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [myStories, storiesByUser]);

  // Track which stories are owned by current user
  const isOwnStory = useCallback((story: Story) => story.user_id === currentUser?.id, [currentUser?.id]);

  const handleStoryClick = (index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  };

  const handleAddStory = () => {
    router.push('/stories/create');
  };

  const handleMyStoryClick = () => {
    // If user has stories, open viewer at their first story
    if (myStories.length > 0) {
      // Find index of first my story in sorted list
      const myIndex = allStoriesSorted.findIndex(s => s.user_id === currentUser?.id);
      if (myIndex !== -1) {
        setViewerIndex(myIndex);
        setViewerOpen(true);
      }
    } else {
      // No stories yet, trigger add
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
      // Get auth user
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!authUser) {
        alert('Please sign in to add a story');
        return;
      }

      // Upload to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${authUser.id}/${Date.now()}.${fileExt}`;
      const mediaType = file.type.startsWith('video') ? 'video' : 'image';


      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('stories')
        .upload(fileName, file);


      if (uploadError) {
        alert(`Storage error: ${uploadError.message}`);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('stories')
        .getPublicUrl(fileName);


      // Create story record
      const result = await uploadStory(urlData.publicUrl, mediaType);


      if (result.error) {
        alert(`Failed to create story: ${result.error}`);
      } else {

        // Trigger parent refresh - this will update stories prop
        onUploadSuccess?.();
      }
    } catch (err: any) {
      alert(`Error: ${err?.message || err}`);
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
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
        {/* My Story button - only show if logged in */}
        {currentUser && (
          <button
            onClick={handleMyStoryClick}
            disabled={isUploading}
            className="flex flex-col items-center gap-1.5 flex-shrink-0"
          >
            <div className="relative">
              <div
                className={cn(
                  'w-14 h-14 rounded-full p-0.5',
                  hasUnviewedMyStory
                    ? 'bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)]'
                    : myStories.length > 0
                      ? 'bg-[var(--border-subtle)]'
                      : 'bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)]'
                )}
              >
                <div className="w-full h-full rounded-full p-0.5 bg-[var(--bg-primary)] overflow-hidden">
                  {currentUser.avatar_url ? (
                    <img
                      src={currentUser.avatar_url}
                      alt={currentUser.display_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Avatar
                      src={null}
                      name={currentUser.display_name}
                      size="xl"
                      className="w-full h-full"
                    />
                  )}
                </div>
              </div>
              {/* Add icon - only show when no stories */}
              {myStories.length === 0 && (
                <div className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-[var(--accent-primary)] flex items-center justify-center border-2 border-[var(--bg-primary)]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-inverse)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" /><path d="M12 5v14" />
                  </svg>
                </div>
              )}
            </div>
            <span className="text-xs text-[var(--text-muted)] max-w-[56px] truncate">
              {myStories.length > 0 ? 'My story' : 'Add story'}
            </span>
          </button>
        )}

        {/* Other users' stories */}
        {allStoriesSorted
          .filter(s => s.user_id !== currentUser?.id)
          .map((story) => (
            <button
              key={story.id}
              onClick={() => handleStoryClick(allStoriesSorted.indexOf(story))}
              className="flex flex-col items-center gap-1.5 flex-shrink-0"
            >
              <div
                className={cn(
                  'w-14 h-14 rounded-full p-0.5',
                  story.hasViewed
                    ? 'bg-[var(--border-subtle)]'
                    : 'bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)]'
                )}
              >
                <div className="w-full h-full rounded-full p-0.5 bg-[var(--bg-primary)] overflow-hidden">
                  <Avatar
                    src={story.user.avatar_url}
                    name={story.user.display_name}
                    size="xl"
                    className="w-full h-full"
                  />
                </div>
              </div>
              <span className="text-xs text-[var(--text-muted)] max-w-[56px] truncate">
                {story.user.display_name.split(' ')[0]}
              </span>
            </button>
          ))}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Story viewer modal */}
      {viewerOpen && allStoriesSorted.length > 0 && (
        <StoryViewer
          stories={allStoriesSorted}
          initialIndex={viewerIndex}
          onClose={() => setViewerOpen(false)}
          isOwner={isOwnStory(allStoriesSorted[viewerIndex])}
        />
      )}
    </>
  );
}