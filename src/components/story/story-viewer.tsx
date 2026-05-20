'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/design-system/skeleton';
import { addStoryReaction, getStoryReactions, sendStoryReply, getStoryViewers, markStoryReplyAsRead, getStoryMusic } from '@/services/stories';
import { AddToHighlightModal } from '@/components/highlights/add-to-highlight-modal';

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
  music?: {
    track_name: string;
    artist: string;
    preview_url: string;
    cover_url: string;
  };
}

interface StoryViewerProps {
  stories: Story[];
  initialIndex: number;
  onClose: () => void;
  isOwner?: boolean;
}

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👏'];

export function StoryViewer({ stories, initialIndex, onClose, isOwner = false }: StoryViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const progressRef = useRef<NodeJS.Timeout | null>(null);

  // Reply state
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replySent, setReplySent] = useState(false);

  // Reactions state
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [reactions, setReactions] = useState<{ emoji: string; count: number; users: string[] }[]>([]);
  const [userReaction, setUserReaction] = useState<string | null>(null);

  // Viewers state (for story owner)
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<{ user: any; viewedAt: string }[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  // Long press state
  const [isPaused, setIsPaused] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  // Highlight modal state
  const [showHighlightModal, setShowHighlightModal] = useState(false);

  // Video state
  const [videoProgress, setVideoProgress] = useState(0);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Swipe up state
  const [swipeUpDistance, setSwipeUpDistance] = useState(0);
  const touchStartY = useRef<number | null>(null);
  const isSwipingUp = useRef(false);

  // Transition state
  const [transitionDirection, setTransitionDirection] = useState<'none' | 'left' | 'right'>('none');

  const supabase = createClient();
  const currentStory = stories[currentIndex];
  const isVideo = currentStory?.media_type === 'video';
  const duration = isVideo ? 15000 : 5000;

  // Load reactions for current story
  useEffect(() => {
    if (currentStory) {
      getStoryReactions(currentStory.id).then(setReactions);
    }
  }, [currentStory]);

  // Load music for current story
  useEffect(() => {
    if (currentStory) {
      getStoryMusic(currentStory.id).then(music => {
        if (music) {
          currentStory.music = {
            track_name: music.track_name,
            artist: music.artist,
            preview_url: music.preview_url,
            cover_url: music.cover_url,
          };
        }
      });
    }
  }, [currentStory]);

  // Load viewers if owner
  useEffect(() => {
    if (isOwner && currentStory && showViewers) {
      setLoadingViewers(true);
      getStoryViewers(currentStory.id).then(data => {
        setViewers(data);
        setLoadingViewers(false);
      });
    }
  }, [isOwner, currentStory, showViewers]);

  const markAsViewed = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !currentStory) return;

    await supabase.from('story_views').upsert({
      story_id: currentStory.id,
      user_id: user.id,
    }, { onConflict: 'story_id,user_id' });
  }, [supabase, currentStory]);

  const goToNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setTransitionDirection('left');
      setTimeout(() => {
        setCurrentIndex(currentIndex + 1);
        setProgress(0);
        setIsLoading(true);
        setImageError(false);
        setShowReplyInput(false);
        setReplyMessage('');
        setReplySent(false);
        setShowReactionPicker(false);
        setShowViewers(false);
        setSwipeUpDistance(0);
        setTransitionDirection('none');
      }, 150);
    } else {
      onClose();
    }
  }, [currentIndex, stories.length, onClose]);

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setTransitionDirection('right');
      setTimeout(() => {
        setCurrentIndex(currentIndex - 1);
        setProgress(0);
        setIsLoading(true);
        setImageError(false);
        setShowReplyInput(false);
        setReplyMessage('');
        setReplySent(false);
        setShowReactionPicker(false);
        setShowViewers(false);
        setSwipeUpDistance(0);
        setTransitionDirection('none');
      }, 150);
    }
  }, [currentIndex]);

  // Progress bar timer
  useEffect(() => {
    if (progressRef.current) {
      clearInterval(progressRef.current);
    }

    if (isPaused || showReplyInput) return;

    setProgress(0);
    const interval = 50;
    const increment = (interval / duration) * 100;

    progressRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          goToNext();
          return 100;
        }
        return prev + increment;
      });
    }, interval);

    markAsViewed();

    return () => {
      if (progressRef.current) {
        clearInterval(progressRef.current);
      }
    };
  }, [currentIndex, duration, goToNext, markAsViewed, isPaused, showReplyInput]);

  // Preload next story
  useEffect(() => {
    if (currentIndex < stories.length - 1) {
      const nextStory = stories[currentIndex + 1];
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = nextStory.media_url;
    }
  }, [currentIndex, stories]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, goToNext, goToPrevious]);

  // Touch handling - swipe up to reply
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    isSwipingUp.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;

    const currentY = e.touches[0].clientY;
    const diff = touchStartY.current - currentY;

    // Swipe up detected
    if (diff > 30) {
      isSwipingUp.current = true;
      setSwipeUpDistance(Math.min(diff, 150));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;

    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY.current - touchEndY;

    // Swipe up to reply (if not owner and distance is enough)
    if (diff > 80 && !isOwner) {
      setShowReplyInput(true);
      setSwipeUpDistance(0);
    } else if (Math.abs(diff) > 50) {
      // Horizontal swipe
      if (diff > 0) {
        goToNext();
      } else {
        goToPrevious();
      }
    }

    touchStartY.current = null;
    isSwipingUp.current = false;
    setSwipeUpDistance(0);
  };

  // Long press handler
  const handleLongPressStart = () => {
    longPressTimer.current = setTimeout(() => {
      setIsPaused(true);
    }, 300);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setIsPaused(false);
  };

  // Handle reaction
  const handleReaction = async (emoji: string) => {
    if (!currentStory) return;

    await addStoryReaction(currentStory.id, emoji);
    const updatedReactions = await getStoryReactions(currentStory.id);
    setReactions(updatedReactions);
    setShowReactionPicker(false);
  };

  // Handle reply send
  const handleSendReply = async () => {
    if (!currentStory || !replyMessage.trim() || sendingReply) return;

    setSendingReply(true);
    const result = await sendStoryReply(currentStory.id, replyMessage, currentStory.user.id);

    if (result.success) {
      setReplySent(true);
      setReplyMessage('');
      setShowReplyInput(false);
    }

    setSendingReply(false);
  };

  if (!currentStory) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18" /><path d="m6 6 12 12" />
        </svg>
      </button>

      {/* Progress bars */}
      <div className="absolute top-4 left-4 right-4 flex gap-1 z-10">
        {stories.map((story, idx) => (
          <div
            key={story.id}
            className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-white rounded-full transition-all duration-75"
              style={{
                width: idx === currentIndex
                  ? `${progress}%`
                  : idx < currentIndex
                    ? '100%'
                    : '0%'
              }}
            />
          </div>
        ))}
      </div>

      {/* User info */}
      <div className="absolute top-12 left-4 right-4 flex items-center gap-3 z-10">
        <div className="w-8 h-8 rounded-full overflow-hidden bg-[var(--bg-secondary)]">
          {currentStory.user.avatar_url ? (
            <img
              src={currentStory.user.avatar_url}
              alt={currentStory.user.display_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white text-sm font-semibold">
              {currentStory.user.display_name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1">
          <p className="text-white font-semibold text-sm">{currentStory.user.display_name}</p>
          <p className="text-white/60 text-xs">
            {new Date(currentStory.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        {isOwner && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHighlightModal(true)}
              className="text-white/70 hover:text-white text-sm flex items-center gap-1"
              title="Save to highlight"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            <button
              onClick={() => setShowViewers(!showViewers)}
              className="text-white/70 hover:text-white text-sm flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span className="text-xs">{viewers.length}</span>
            </button>
          </div>
        )}
      </div>

      {/* Viewers list overlay */}
      {showViewers && (
        <div className="absolute top-20 right-4 w-72 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl z-20 max-h-80 overflow-hidden">
          <div className="p-3 border-b border-[var(--border-subtle)]">
            <h3 className="font-semibold text-white">Viewers</h3>
          </div>
          <div className="overflow-y-auto max-h-64">
            {loadingViewers ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton variant="circular" width={32} height={32} />
                    <Skeleton variant="text" width="50%" />
                  </div>
                ))}
              </div>
            ) : viewers.length > 0 ? (
              viewers.map((viewer, idx) => (
                <div
                  key={viewer.user?.id || idx}
                  className="flex items-center gap-3 p-3 hover:bg-[var(--bg-tertiary)]"
                >
                  <Avatar src={viewer.user?.avatar_url} name={viewer.user?.display_name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {viewer.user?.username || 'Unknown'}
                    </p>
                    <p className="text-[var(--text-muted)] text-xs">
                      {new Date(viewer.viewedAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-[var(--text-muted)] text-sm">No viewers yet</div>
            )}
          </div>
        </div>
      )}

      {/* Story content */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-transform duration-150 ${
          transitionDirection === 'left' ? '-translate-x-full' :
          transitionDirection === 'right' ? 'translate-x-full' : ''
        }`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const width = rect.width;

          if (x < width / 3) {
            goToPrevious();
          } else if (x > (width * 2) / 3) {
            goToNext();
          }
        }}
        onMouseDown={handleLongPressStart}
        onMouseUp={handleLongPressEnd}
        onMouseLeave={handleLongPressEnd}
      >
        {isLoading && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {isPaused && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/70">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="4" height="16" rx="1" x="6" y="4" />
              <rect width="4" height="16" rx="1" x="14" y="4" />
            </svg>
          </div>
        )}

        {/* Video progress indicator */}
        {isVideo && isVideoReady && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-32">
            <div className="h-1 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-100"
                style={{ width: `${videoProgress}%` }}
              />
            </div>
          </div>
        )}

        {isVideo ? (
          <video
            ref={videoRef}
            src={currentStory.media_url}
            className="max-w-full max-h-full object-contain"
            autoPlay
            muted
            playsInline
            onLoadedData={() => {
              setIsLoading(false);
              setIsVideoReady(true);
            }}
            onTimeUpdate={() => {
              if (videoRef.current) {
                const progress = (videoRef.current.currentTime / videoRef.current.duration) * 100;
                setVideoProgress(progress);
              }
            }}
            onEnded={() => goToNext()}
            onError={() => {
              setIsLoading(false);
              setImageError(true);
            }}
          />
        ) : (
          <img
            src={currentStory.media_url}
            alt="Story"
            className={`max-w-full max-h-full object-contain transition-opacity ${isLoading ? 'opacity-0' : 'opacity-100'}`}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setImageError(true);
            }}
          />
        )}

        {imageError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-white">Failed to load story</p>
          </div>
        )}

        {/* Swipe up indicator */}
        {!isOwner && !showReplyInput && (
          <div
            className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 transition-transform"
            style={{ transform: `translateY(-${swipeUpDistance * 0.3}px)` }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
              <path d="m18 15-6-6-6 6" />
            </svg>
            <span className="text-white/60 text-xs">Swipe up to reply</span>
          </div>
        )}
      </div>

      {/* Navigation hints */}
      <div className="absolute inset-y-0 left-0 w-1/3 cursor-pointer" onClick={goToPrevious} />
      <div className="absolute inset-y-0 right-0 w-1/3 cursor-pointer" onClick={goToNext} />

      {/* Bottom action bar */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent z-10">
        {/* Music display */}
        {currentStory?.music && (
          <div className="flex items-center gap-3 mb-3 bg-white/10 rounded-full px-4 py-2">
            <button
              onClick={() => setIsMusicPlaying(!isMusicPlaying)}
              className="w-8 h-8 rounded-full bg-[var(--accent-primary)] flex items-center justify-center"
            >
              {isMusicPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white">
                  <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white">
                  <path d="m5 3 14 9-14 9V3Z" />
                </svg>
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{currentStory.music.track_name}</p>
              <p className="text-white/60 text-xs truncate">{currentStory.music.artist}</p>
            </div>
            {currentStory.music.cover_url && (
              <img
                src={currentStory.music.cover_url}
                alt={`${currentStory.music.track_name} cover art`}
                className="w-8 h-8 rounded-full object-cover"
              />
            )}
          </div>
        )}

        {/* Reply input */}
        {showReplyInput ? (
          <div className="flex items-center gap-2 mb-2">
            <input
              type="text"
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
              placeholder="Send a message..."
              className="flex-1 px-4 py-2 rounded-full bg-white/20 text-white placeholder:text-white/50 border border-white/20 focus:outline-none focus:border-white/40"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
            />
            <button
              onClick={handleSendReply}
              disabled={sendingReply || !replyMessage.trim()}
              className="p-2 rounded-full bg-white/20 text-white hover:bg-white/30 disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
            </button>
            <button
              onClick={() => {
                setShowReplyInput(false);
                setReplyMessage('');
              }}
              className="p-2 rounded-full text-white/70 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        ) : replySent ? (
          <div className="text-white/70 text-sm mb-2 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Message sent
          </div>
        ) : null}

        {/* Reaction bar */}
        <div className="flex items-center justify-between">
          {/* Quick reactions */}
          <div className="flex items-center gap-1">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className="w-10 h-10 flex items-center justify-center text-xl hover:bg-white/10 rounded-full transition-transform hover:scale-125"
              >
                {emoji}
              </button>
            ))}
            <button
              onClick={() => setShowReactionPicker(!showReactionPicker)}
              className="w-10 h-10 flex items-center justify-center text-white/70 hover:bg-white/10 rounded-full"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" x2="9.01" y1="9" y2="9" />
                <line x1="15" x2="15.01" y1="9" y2="9" />
              </svg>
            </button>
          </div>

          {/* Reply button */}
          {!showReplyInput && !replySent && (
            <button
              onClick={() => setShowReplyInput(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 text-white hover:bg-white/30"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className="text-sm">Reply</span>
            </button>
          )}
        </div>

        {/* Reaction counts */}
        {reactions.length > 0 && (
          <div className="flex items-center gap-2 mt-2 text-white/80 text-sm">
            {reactions.slice(0, 5).map((r) => (
              <span key={r.emoji} className="flex items-center gap-1">
                <span>{r.emoji}</span>
                <span className="text-xs">{r.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Reaction picker modal */}
      {showReactionPicker && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl p-4 z-20">
          <div className="grid grid-cols-6 gap-2">
            {[
              '❤️', '😍', '😊', '🥰', '😘', '🤩',
              '😂', '🤣', '😄', '😅', '😆', '😁',
              '😮', '😲', '😱', '🤯', '😵', '🥳',
              '😢', '😭', '😔', '😪', '🥺', '😿',
              '🔥', '💯', '👏', '🎉', '✨', '💪',
              '👎', '👌', '💕', '❤️‍🔥', '💖', '💙'
            ].map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className="w-10 h-10 flex items-center justify-center text-2xl hover:bg-[var(--bg-tertiary)] rounded-lg transition-transform hover:scale-125"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add to highlight modal */}
      {showHighlightModal && (
        <AddToHighlightModal
          storyId={currentStory.id}
          storyUrl={currentStory.media_url}
          onClose={() => setShowHighlightModal(false)}
          onSuccess={() => {
            setShowHighlightModal(false);
            // Could show a success toast here
          }}
        />
      )}
    </div>
  );
}
