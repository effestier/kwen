'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/design-system/skeleton';
import { addStoryReaction, getStoryReactions, sendStoryReply, getStoryViewers, markStoryReplyAsRead, getStoryMusic } from '@/services/stories';
import { AddToHighlightModal } from '@/components/highlights/add-to-highlight-modal';
import { pushOverlay, popOverlay } from '@/lib/overlay-stack';
import { hapticLight } from '@/lib/haptics';
import { muteUser, unmuteUser } from '@/services/posts';
import { PollDisplay } from '@/components/stickers/poll-sticker';
import { QuestionDisplay } from '@/components/stickers/question-sticker';
import { CountdownDisplay } from '@/components/stickers/countdown-sticker';
import { getPollByStory, voteOnPoll, getPollResults, getQuestionByStory, respondToQuestion, getQuestionResponses, getCountdownByStory } from '@/services/stickers';
import type { Poll, PollResults, StoryQuestion, Countdown } from '@/services/stickers';
import { ShareStoryModal } from '@/components/story/share-story-modal';

// ---- Types ----

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

interface GroupedUser {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  stories: Story[];
}

interface StoryViewerProps {
  users: GroupedUser[];
  initialUserIndex: number;
  initialStoryIndex: number;
  onClose: () => void;
  currentUserId: string;
}

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👏'];
const IMAGE_DURATION = 5000;
const MAX_VIDEO_DURATION = 60000;

// ---- Helpers ----

function flattenStories(users: GroupedUser[]): { userIndex: number; storyIndex: number; story: Story }[] {
  const flat: { userIndex: number; storyIndex: number; story: Story }[] = [];
  for (let ui = 0; ui < users.length; ui++) {
    for (let si = 0; si < users[ui].stories.length; si++) {
      flat.push({ userIndex: ui, storyIndex: si, story: users[ui].stories[si] });
    }
  }
  return flat;
}

// ---- Component ----

export function StoryViewer({ users, initialUserIndex, initialStoryIndex, onClose, currentUserId }: StoryViewerProps) {
  const [userIndex, setUserIndex] = useState(initialUserIndex);
  const [storyIndex, setStoryIndex] = useState(initialStoryIndex);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [storyDuration, setStoryDuration] = useState(IMAGE_DURATION);
  const progressRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);

  // Reply state
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replySent, setReplySent] = useState(false);

  // Reactions state
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [reactions, setReactions] = useState<{ emoji: string; count: number; users: string[] }[]>([]);

  // Viewers state (for story owner)
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<{ user: any; viewedAt: string }[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);

  // Music state
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  // Long press / pause state
  const [isPaused, setIsPaused] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  // Video mute state (persisted)
  const [isMuted, setIsMuted] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('kw-story-muted') === 'true';
    }
    return true;
  });
  const [isBuffering, setIsBuffering] = useState(false);

  // Highlight modal
  const [showHighlightModal, setShowHighlightModal] = useState(false);

  // Share
  const [showShareModal, setShowShareModal] = useState(false);

  // More menu
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [mutedUserIds, setMutedUserIds] = useState<Set<string>>(new Set());

  // Toast
  const [viewerToast, setViewerToast] = useState<string | null>(null);

  // Interactive stickers
  const [poll, setPoll] = useState<Poll | null>(null);
  const [pollResults, setPollResults] = useState<PollResults | null>(null);
  const [question, setQuestion] = useState<StoryQuestion | null>(null);
  const [questionResponses, setQuestionResponses] = useState<any[]>([]);
  const [showResponses, setShowResponses] = useState(false);
  const [countdown, setCountdown] = useState<Countdown | null>(null);

  // Video state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  // H18: Guard against double-fire of goToNext (rAF + video onEnded)
  const navigatingRef = useRef(false);
  // H19: Local music state instead of mutating prop
  const [musicData, setMusicData] = useState<Story['music']>(undefined);

  // Gesture state
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const gestureCompletedRef = useRef(false);
  const longPressActiveRef = useRef(false);
  const [swipeDownDistance, setSwipeDownDistance] = useState(0);

  // Transition state
  const [transitionDirection, setTransitionDirection] = useState<'none' | 'left' | 'right'>('none');

  // Desktop detection
  const [isDesktop, setIsDesktop] = useState(false);

  const supabase = createClient();

  const currentUser = users[userIndex];
  const currentStory = currentUser?.stories[storyIndex];
  const isOwner = currentUserId === currentUser?.userId;
  const isVideo = currentStory?.media_type === 'video';

  // Desktop media query
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Register with overlay stack for back button handling
  useEffect(() => {
    pushOverlay(onClose);
    return () => {
      popOverlay();
      // Cleanup music on unmount
      if (musicRef.current) {
        musicRef.current.pause();
        musicRef.current = null;
      }
    };
  }, [onClose]);

  // Load reactions for current story
  useEffect(() => {
    if (currentStory) {
      getStoryReactions(currentStory.id).then(setReactions);
    }
  }, [currentStory?.id]);

  // Load music for current story and auto-play
  useEffect(() => {
    if (!currentStory) return;

    // Stop any playing music first
    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current = null;
      setIsMusicPlaying(false);
    }

    getStoryMusic(currentStory.id).then(music => {
      if (music) {
        // H19: Store music in local state instead of mutating the prop
        setMusicData({
          track_name: music.track_name,
          artist: music.artist,
          preview_url: music.preview_url,
          cover_url: music.cover_url,
        });

        // Auto-play music if preview_url exists
        if (music.preview_url) {
          const audio = new Audio(music.preview_url);
          audio.volume = 0.7;
          audio.loop = true;
          audio.play().catch(() => {});
          musicRef.current = audio;
          setIsMusicPlaying(true);
        }
      } else {
        setMusicData(undefined);
      }
    });

    return () => {
      if (musicRef.current) {
        musicRef.current.pause();
        musicRef.current = null;
        setIsMusicPlaying(false);
      }
    };
  }, [currentStory?.id]);

  // Load interactive stickers for current story
  useEffect(() => {
    if (!currentStory) return;

    setPoll(null);
    setPollResults(null);
    setQuestion(null);
    setQuestionResponses([]);
    setShowResponses(false);
    setCountdown(null);

    Promise.all([
      getPollByStory(currentStory.id),
      getQuestionByStory(currentStory.id),
      getCountdownByStory(currentStory.id),
    ]).then(([pollData, questionData, countdownData]) => {
      if (pollData) {
        setPoll(pollData);
        getPollResults(pollData.id).then(setPollResults);
      }
      if (questionData) {
        setQuestion(questionData);
        if (isOwner) {
          getQuestionResponses(questionData.id).then(setQuestionResponses);
        }
      }
      if (countdownData) {
        setCountdown(countdownData);
      }
    });
  }, [currentStory?.id, isOwner]);

  // Load viewers if owner
  useEffect(() => {
    if (isOwner && currentStory && showViewers) {
      setLoadingViewers(true);
      getStoryViewers(currentStory.id).then(data => {
        setViewers(data);
        setLoadingViewers(false);
      });
    }
  }, [isOwner, currentStory?.id, showViewers]);

  const markAsViewed = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !currentStory) return;

    await supabase.from('story_views').upsert({
      story_id: currentStory.id,
      user_id: user.id,
    }, { onConflict: 'story_id,user_id' });
  }, [supabase, currentStory?.id]);

  // ---- Navigation ----

  const resetStoryState = useCallback(() => {
    // Pause music explicitly
    if (musicRef.current) {
      musicRef.current.pause();
    }
    setProgress(0);
    setIsLoading(true);
    setImageError(false);
    setShowReplyInput(false);
    setReplyMessage('');
    setReplySent(false);
    setShowReactionPicker(false);
    setShowViewers(false);
    setShowMoreMenu(false);
    setIsVideoReady(false);
    setIsMusicPlaying(false);
    setSwipeDownDistance(0);
  }, []);

  const goToNext = useCallback(() => {
    // H18: Guard against double-fire from rAF + video onEnded
    if (navigatingRef.current) return;
    navigatingRef.current = true;

    const currentUserData = users[userIndex];
    if (!currentUserData) { navigatingRef.current = false; return; }

    // H23: Pause video immediately to prevent audio bleed during transition
    if (videoRef.current) {
      videoRef.current.pause();
    }

    if (storyIndex < currentUserData.stories.length - 1) {
      // Next story within same user
      setTransitionDirection('left');
      setTimeout(() => {
        setStoryIndex(storyIndex + 1);
        resetStoryState();
        setTransitionDirection('none');
      }, 150);
    } else if (userIndex < users.length - 1) {
      // First story of next user
      setTransitionDirection('left');
      setTimeout(() => {
        setUserIndex(userIndex + 1);
        setStoryIndex(0);
        resetStoryState();
        setTransitionDirection('none');
      }, 150);
    } else {
      // Last story of last user — close
      onClose();
    }
  }, [userIndex, storyIndex, users, onClose, resetStoryState]);

  const goToPrevious = useCallback(() => {
    if (storyIndex > 0) {
      setTransitionDirection('right');
      setTimeout(() => {
        setStoryIndex(storyIndex - 1);
        resetStoryState();
        setTransitionDirection('none');
      }, 150);
    } else if (userIndex > 0) {
      // Last story of previous user
      const prevUser = users[userIndex - 1];
      setTransitionDirection('right');
      setTimeout(() => {
        setUserIndex(userIndex - 1);
        setStoryIndex(prevUser.stories.length - 1);
        resetStoryState();
        setTransitionDirection('none');
      }, 150);
    }
  }, [userIndex, storyIndex, users, resetStoryState]);

  const goToUser = useCallback((targetUserIndex: number) => {
    if (targetUserIndex === userIndex) return;
    const direction = targetUserIndex > userIndex ? 'left' : 'right';
    setTransitionDirection(direction);
    setTimeout(() => {
      setUserIndex(targetUserIndex);
      setStoryIndex(0);
      resetStoryState();
      setTransitionDirection('none');
    }, 150);
  }, [userIndex, resetStoryState]);

  // ---- Video timing ----

  useEffect(() => {
    if (!currentStory) return;

    if (isVideo) {
      // Wait for video metadata to set duration
      setStoryDuration(IMAGE_DURATION); // temporary fallback
      setIsVideoReady(false);
    } else {
      setStoryDuration(IMAGE_DURATION);
    }

    setProgress(0);
  }, [currentStory?.id, isVideo]);

  const handleVideoMetadata = useCallback(() => {
    if (videoRef.current) {
      const durationMs = Math.min(videoRef.current.duration * 1000, MAX_VIDEO_DURATION);
      setStoryDuration(durationMs);
      setIsVideoReady(true);
    }
  }, []);

  // Sync music pause/resume with story pause
  useEffect(() => {
    if (!musicRef.current) return;
    if (isPaused || showReplyInput) {
      musicRef.current.pause();
    } else if (isMusicPlaying) {
      musicRef.current.play().catch(() => {});
    }
  }, [isPaused, showReplyInput, isMusicPlaying]);

  // ---- Progress bar (requestAnimationFrame) — pause/resume safe ----

  useEffect(() => {
    if (isPaused || showReplyInput || isLoading) {
      // When pausing, snapshot elapsed time
      if (progressRef.current !== null) {
        cancelAnimationFrame(progressRef.current);
        progressRef.current = null;
      }
      return;
    }

    // Resume from where we left off (elapsedRef persists across pause)
    startTimeRef.current = performance.now() - elapsedRef.current;

    const tick = (now: number) => {
      const elapsed = now - startTimeRef.current;
      elapsedRef.current = elapsed;
      const pct = Math.min((elapsed / storyDuration) * 100, 100);
      setProgress(pct);

      if (pct >= 100) {
        goToNext();
        return;
      }
      progressRef.current = requestAnimationFrame(tick);
    };

    progressRef.current = requestAnimationFrame(tick);
    markAsViewed();

    return () => {
      if (progressRef.current !== null) {
        cancelAnimationFrame(progressRef.current);
        progressRef.current = null;
      }
    };
  }, [userIndex, storyIndex, storyDuration, isPaused, showReplyInput, isLoading, goToNext, markAsViewed]);

  // Reset elapsed when story changes
  useEffect(() => {
    elapsedRef.current = 0;
    navigatingRef.current = false; // H18: Reset double-fire guard
  }, [userIndex, storyIndex]);

  // ---- Preloading (next 3 stories across user boundaries) ----

  useEffect(() => {
    const flat = flattenStories(users);
    const currentFlatIndex = flat.findIndex(
      s => s.userIndex === userIndex && s.storyIndex === storyIndex
    );
    if (currentFlatIndex === -1) return;

    const preloaded: (HTMLImageElement | HTMLVideoElement)[] = [];

    for (let i = 1; i <= 3; i++) {
      const next = flat[currentFlatIndex + i];
      if (!next) break;

      if (next.story.media_type === 'video') {
        const video = document.createElement('video');
        video.preload = 'auto';
        video.src = next.story.media_url;
        preloaded.push(video);
      } else {
        const img = new Image();
        img.src = next.story.media_url;
        preloaded.push(img);
      }
    }

    return () => {
      // Abort preload downloads to prevent network leaks
      preloaded.forEach(el => {
        if (el instanceof HTMLVideoElement) {
          el.pause();
          el.removeAttribute('src');
          el.load();
        } else {
          (el as HTMLImageElement).src = '';
        }
      });
    };
  }, [userIndex, storyIndex, users]);

  // ---- Keyboard navigation ----

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

  // ---- Gesture handling ----

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    setSwipeDownDistance(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    // Track swipe-down distance for visual feedback
    if (dy > 30 && Math.abs(dy) > Math.abs(dx)) {
      setSwipeDownDistance(Math.min(dy, 200));
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const elapsed = Date.now() - touchStartRef.current.time;
    const velocity = Math.sqrt(dx * dx + dy * dy) / elapsed; // px/ms

    const isHorizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
    const isVertical = Math.abs(dy) > Math.abs(dx) * 1.2;

    // Fast swipe needs less distance
    const fastSwipe = velocity > 0.5;

    // M17/M41: Require clear directional intent — ambiguous diagonals do nothing
    if (!isHorizontal && !isVertical) {
      touchStartRef.current = null;
      setSwipeDownDistance(0);
      return;
    }

    if (isVertical && dy > 0) {
      // Downward swipe — close
      if (dy > 80 || (fastSwipe && dy > 30)) {
        gestureCompletedRef.current = true;
        onClose();
        touchStartRef.current = null;
        setSwipeDownDistance(0);
        return;
      }
    } else if (isVertical && dy < 0) {
      // Upward swipe — reply
      if (dy < -80 || (fastSwipe && dy < -30)) {
        if (!isOwner) {
          gestureCompletedRef.current = true;
          setShowReplyInput(true);
        }
        touchStartRef.current = null;
        setSwipeDownDistance(0);
        return;
      }
    }

    if (isHorizontal) {
      if (dx < -50 || (fastSwipe && dx < -20)) {
        gestureCompletedRef.current = true;
        goToUser(userIndex + 1 < users.length ? userIndex + 1 : userIndex);
      } else if (dx > 50 || (fastSwipe && dx > 20)) {
        gestureCompletedRef.current = true;
        goToUser(userIndex - 1 >= 0 ? userIndex - 1 : userIndex);
      }
    }

    touchStartRef.current = null;
    setSwipeDownDistance(0);
  }, [onClose, isOwner, userIndex, users.length, goToUser]);

  // ---- Long press handler ----

  const handleLongPressStart = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      longPressActiveRef.current = true;
      setIsPaused(true);
    }, 300);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (longPressActiveRef.current) {
      longPressActiveRef.current = false;
      // Suppress the click that fires after mouseup
      setTimeout(() => { gestureCompletedRef.current = false; }, 50);
      gestureCompletedRef.current = true;
    }
    setIsPaused(false);
  }, []);

  // ---- Reaction handler ----

  const handleReaction = useCallback(async (emoji: string) => {
    if (!currentStory) return;
    hapticLight();
    await addStoryReaction(currentStory.id, emoji);
    const updatedReactions = await getStoryReactions(currentStory.id);
    setReactions(updatedReactions);
    setShowReactionPicker(false);
  }, [currentStory?.id]);

  // ---- Poll vote ----

  const handlePollVote = useCallback(async (option: 1 | 2) => {
    if (!poll) return;
    const result = await voteOnPoll(poll.id, option);
    if (result.success) {
      const results = await getPollResults(poll.id);
      setPollResults(results);
    }
  }, [poll]);

  // ---- Question response ----

  const handleQuestionResponse = useCallback(async (response: string) => {
    if (!question) return;
    await respondToQuestion(question.id, response);
  }, [question]);

  // ---- Reply send ----

  const handleSendReply = useCallback(async () => {
    if (!currentStory || !replyMessage.trim() || sendingReply) return;

    setSendingReply(true);
    const result = await sendStoryReply(currentStory.id, replyMessage, currentStory.user.id);

    if (!('error' in result)) {
      setReplySent(true);
      setReplyMessage('');
      setShowReplyInput(false);
    }

    setSendingReply(false);
  }, [currentStory?.id, replyMessage, sendingReply]);

  // ---- Tap handler ----

  const handleContentClick = useCallback((e: React.MouseEvent) => {
    // Suppress click after gesture (swipe, long-press)
    if (gestureCompletedRef.current) {
      gestureCompletedRef.current = false;
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    // Instagram: left ~30% = previous, remaining ~70% = next
    if (x < width * 0.3) {
      goToPrevious();
    } else {
      goToNext();
    }
  }, [goToPrevious, goToNext]);

  if (!currentStory || !currentUser) return null;

  const totalUserStories = currentUser.stories.length;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${
        isDesktop ? 'bg-black/80' : 'bg-black'
      }`}
      style={{
        paddingTop: isDesktop ? 0 : 'env(safe-area-inset-top)',
        paddingBottom: isDesktop ? 0 : 'env(safe-area-inset-bottom)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Desktop modal container */}
      <div
        className={`relative ${
          isDesktop
            ? 'w-full max-w-[420px] max-h-[750px] h-full rounded-2xl overflow-hidden'
            : 'w-full h-full'
        }`}
        style={swipeDownDistance > 0 ? { transform: `translateY(${swipeDownDistance * 0.5}px)`, opacity: 1 - swipeDownDistance / 400 } : undefined}
      >
        {/* Close + mute buttons */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          {isVideo && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const newMuted = !isMuted;
                setIsMuted(newMuted);
                localStorage.setItem('kw-story-muted', String(newMuted));
                if (videoRef.current) videoRef.current.muted = newMuted;
              }}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              {isMuted ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" x2="17" y1="9" y2="15" /><line x1="17" x2="23" y1="9" y2="15" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Progress bars — one segment per story in current user */}
        <div className="absolute top-4 left-4 right-12 flex gap-1 z-10">
          {currentUser.stories.map((story, idx) => (
            <div
              key={story.id}
              className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden"
            >
              <div
                className="h-full bg-white rounded-full transition-none"
                style={{
                  width: idx === storyIndex
                    ? `${progress}%`
                    : idx < storyIndex
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
            {currentUser.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt={currentUser.displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-sm font-semibold">
                {currentUser.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
            <div className="flex-1">
              <p className="text-white font-semibold text-sm">{currentUser.displayName}</p>
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
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          key={currentStory.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleContentClick}
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

          {/* Buffering indicator */}
          {isVideo && isBuffering && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {isVideo ? (
            <video
              ref={videoRef}
              src={currentStory.media_url}
              className="max-w-full max-h-full object-contain"
              autoPlay
              muted={isMuted}
              playsInline
              onLoadedMetadata={handleVideoMetadata}
              onTimeUpdate={() => {
                if (videoRef.current && videoRef.current.duration) {
                  // rAF handles progress, but we track video time for sync
                }
              }}
              onEnded={() => goToNext()}
              onWaiting={() => setIsBuffering(true)}
              onPlaying={() => setIsBuffering(false)}
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

          {/* Interactive stickers */}
          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-10">
            {poll && (
              <PollDisplay
                poll={poll}
                userVote={pollResults?.user_vote ?? null}
                onVote={handlePollVote}
                showResults={!!pollResults}
              />
            )}

            {question && !poll && (
              <QuestionDisplay
                question={question}
                isOwner={isOwner}
                onSubmitResponse={handleQuestionResponse}
                onViewResponses={() => setShowResponses(true)}
                responseCount={questionResponses.length}
              />
            )}

            {countdown && !poll && !question && (
              <CountdownDisplay countdown={countdown} />
            )}
          </div>

        </motion.div>

        {/* Bottom action bar — Instagram style */}
        <div className="absolute bottom-0 left-0 right-0 z-10">
          {/* Music display */}
          {musicData && (
            <div className="mx-4 mb-2 flex items-center gap-3 bg-white/10 rounded-full px-4 py-2">
              <button
                onClick={() => {
                  const audio = musicRef.current;
                  if (audio) {
                    if (isMusicPlaying) { audio.pause(); setIsMusicPlaying(false); }
                    else { audio.play().catch(() => {}); setIsMusicPlaying(true); }
                  }
                }}
                className="w-8 h-8 rounded-full bg-[var(--accent-primary)] flex items-center justify-center"
              >
                {isMusicPlaying ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="m5 3 14 9-14 9V3Z" /></svg>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{musicData.track_name}</p>
                <p className="text-white/60 text-xs truncate">{musicData.artist}</p>
              </div>
              {musicData.cover_url && (
                <img src={musicData.cover_url} alt="" className="w-8 h-8 rounded-full object-cover" />
              )}
            </div>
          )}

          {/* Audio element */}
          {musicData?.preview_url && (
            <audio ref={musicRef} src={musicData.preview_url} preload="auto" onEnded={() => setIsMusicPlaying(false)} />
          )}

          {/* Reply sent toast */}
          {replySent && (
            <div className="mx-4 mb-2 text-white/70 text-sm flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              Sent
            </div>
          )}

          {/* Main bar */}
          <div className="px-3 pb-4 pt-2 bg-gradient-to-t from-black/60 to-transparent">
            {!isOwner ? (
              <div className="flex items-center gap-2">
                {/* Heart — tap sends ❤️, long-press opens picker */}
                <div className="relative">
                  <button
                    className="w-10 h-10 flex items-center justify-center text-2xl active:scale-90 transition-transform"
                    onClick={() => handleReaction('❤️')}
                    onPointerDown={() => {
                      const timer = setTimeout(() => setShowReactionPicker(true), 400);
                      (window as any).__storyReactionTimer = timer;
                    }}
                    onPointerUp={() => {
                      clearTimeout((window as any).__storyReactionTimer);
                    }}
                    onPointerLeave={() => {
                      clearTimeout((window as any).__storyReactionTimer);
                    }}
                  >
                    ❤️
                  </button>
                  {/* Reaction picker popover */}
                  {showReactionPicker && (
                    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-[#262626] rounded-full px-2 py-1.5 flex items-center gap-0.5 shadow-xl">
                      {['❤️', '😂', '😮', '😢', '🔥', '👏'].map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => { handleReaction(emoji); setShowReactionPicker(false); }}
                          className="w-9 h-9 flex items-center justify-center text-xl hover:bg-white/10 rounded-full transition-transform hover:scale-125 active:scale-90"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Input */}
                {showReplyInput ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder="Send message"
                      className="flex-1 px-4 py-2 rounded-full bg-white/15 text-white text-sm placeholder:text-white/40 border border-white/10 focus:outline-none focus:border-white/30"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                    />
                    {replyMessage.trim() && (
                      <button
                        onClick={handleSendReply}
                        disabled={sendingReply}
                        className="text-white font-semibold text-sm disabled:opacity-50"
                      >
                        Send
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setShowReplyInput(true)}
                    className="flex-1 px-4 py-2 rounded-full bg-white/15 text-white/50 text-sm text-left border border-white/10"
                  >
                    Send message
                  </button>
                )}

                {/* Share */}
                <button
                  onClick={() => setShowShareModal(true)}
                  className="p-2 text-white/80 active:text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
                  </svg>
                </button>
              </div>
            ) : (
              /* Owner: just share */
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowShareModal(true)}
                  className="p-2 text-white/80 active:text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Add to highlight modal */}
        {showHighlightModal && (
          <AddToHighlightModal
            storyId={currentStory.id}
            storyUrl={currentStory.media_url}
            onClose={() => setShowHighlightModal(false)}
            onSuccess={() => {
              setShowHighlightModal(false);
            }}
          />
        )}

        {/* More menu (mute, report) */}
        {showMoreMenu && (
          <div className="absolute bottom-24 right-4 z-30 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl overflow-hidden min-w-[180px] shadow-xl">
            <button
              onClick={async () => {
                const uid = currentStory.user_id;
                const isMuted = mutedUserIds.has(uid);
                if (isMuted) {
                  await unmuteUser(uid);
                  setMutedUserIds(prev => { const n = new Set(prev); n.delete(uid); return n; });
                  setViewerToast(`${currentUser.displayName} unmuted`);
                } else {
                  await muteUser(uid);
                  setMutedUserIds(prev => new Set(prev).add(uid));
                  setViewerToast(`${currentUser.displayName} muted`);
                  goToNext();
                }
                setShowMoreMenu(false);
              }}
              className="w-full px-4 py-3 text-left text-white text-sm hover:bg-[var(--bg-tertiary)] flex items-center gap-3"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {mutedUserIds.has(currentStory?.user_id) ? (
                  <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>
                ) : (
                  <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>
                )}
              </svg>
              {mutedUserIds.has(currentStory?.user_id) ? `Unmute ${currentUser.displayName}` : `Mute ${currentUser.displayName}`}
            </button>
            <button
              onClick={() => {
                setShowMoreMenu(false);
                setViewerToast('Report submitted. Thank you for keeping KWEN safe.');
                setTimeout(() => setViewerToast(null), 3000);
              }}
              className="w-full px-4 py-3 text-left text-[var(--destructive)] text-sm hover:bg-[var(--bg-tertiary)] flex items-center gap-3"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" x2="4" y1="22" y2="15" />
              </svg>
              Report
            </button>
          </div>
        )}

        {/* Toast */}
        {viewerToast && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 bg-white/90 text-black px-4 py-2 rounded-xl text-sm font-medium shadow-lg max-w-[280px] text-center">
            {viewerToast}
          </div>
        )}

        {/* Share story modal */}
        {showShareModal && (
          <ShareStoryModal
            storyId={currentStory.id}
            storyUrl={currentStory.media_url}
            storyUsername={currentUser.username}
            onClose={() => setShowShareModal(false)}
          />
        )}

        {/* Question responses modal */}
        {showResponses && question && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-[var(--bg-secondary)] rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
                <h3 className="font-semibold text-white">Responses</h3>
                <button
                  onClick={() => setShowResponses(false)}
                  className="text-white/70 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto max-h-[60vh]">
                {questionResponses.length > 0 ? (
                  questionResponses.map((r) => (
                    <div key={r.id} className="flex items-start gap-3 p-4 border-b border-[var(--border-subtle)]">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-[var(--bg-tertiary)]">
                        {r.user.avatar_url ? (
                          <img src={r.user.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white text-xs">
                            {r.user.username?.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{r.user.username}</p>
                        <p className="text-[var(--text-muted)] text-sm mt-1">{r.response}</p>
                        <p className="text-[var(--text-muted)] text-xs mt-1">
                          {new Date(r.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-[var(--text-muted)]">
                    No responses yet
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
