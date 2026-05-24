'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { cn, formatNumber, formatTimeAgo } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { toggleLike as togglePostLike, toggleSave as togglePostSave, deletePost, restorePost, blockUser, muteUser } from '@/services/posts';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { getCommentCount } from '@/services/comments';
import { createClient } from '@/lib/supabase/client';
import { EditPostModal } from '@/components/post/edit-post-modal';
import { renderRichText } from '@/lib/text-utils';
import { MediaCarousel } from '@/components/post/media-carousel';
import { HeartAnimation } from '@/components/post/heart-animation';

const CommentsModal = dynamic(() => import('@/components/comments/comments-modal').then(mod => ({ default: mod.CommentsModal })), {
  loading: () => null,
  ssr: false,
});

const ShareModal = dynamic(() => import('@/components/post/share-modal').then(mod => ({ default: mod.ShareModal })), {
  loading: () => null,
  ssr: false,
});

interface MediaItem {
  id: string;
  storage_path: string;
  media_type: string;
  sort_order: number;
}

interface PostCardProps {
  post: {
    id: string;
    user: {
      id: string;
      username: string;
      displayName: string;
      avatar: string;
      isVerified?: boolean;
    };
    content: string;
    images?: string[];
    mediaTypes?: string[];
    media?: MediaItem[];
    likes: number;
    comments: number;
    shares: number;
    saves?: number;
    isLiked: boolean;
    isSaved: boolean;
    createdAt: string;
    location?: string;
  };
  isOwnPost?: boolean;
  onDelete?: (postId: string) => void;
}

const PostCardInner = ({ post, isOwnPost = false, onDelete }: PostCardProps) => {
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [saved, setSaved] = useState(post.isSaved);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comments);
  // H2: Separate loading flags for like and save so they don't block each other
  const [likeLoading, setLikeLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [editedAt, setEditedAt] = useState<string | null>(null);
  const [heartTrigger, setHeartTrigger] = useState(0);
  // H7: Caption expand/collapse state
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const captionNeedsTruncation = post.content && post.content.length > 300;
  const supabase = createClient();

  useEffect(() => { setLiked(post.isLiked); }, [post.isLiked]);
  useEffect(() => { setLikeCount(post.likes); }, [post.likes]);
  useEffect(() => { setSaved(post.isSaved); }, [post.isSaved]);
  useEffect(() => { setCommentCount(post.comments); }, [post.comments]);

  const handleLike = useCallback(async () => {
    if (likeLoading) return;
    setLikeLoading(true);
    if (!liked) hapticLight();
    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(!liked);
    setLikeCount(liked ? likeCount - 1 : likeCount + 1);
    try {
      await togglePostLike(post.id);
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
    } finally {
      setLikeLoading(false);
    }
  }, [liked, likeCount, likeLoading, post.id]);

  // H1/H6: Carousel already detects double-tap — this handler just fires the like + animation
  const handleMediaDoubleTap = useCallback(() => {
    if (!liked) handleLike();
    setHeartTrigger(prev => prev + 1);
    hapticMedium();
  }, [liked, handleLike]);

  const handleSave = useCallback(async () => {
    if (saveLoading) return;
    setSaveLoading(true);
    const prevSaved = saved;
    setSaved(!saved);
    try {
      await togglePostSave(post.id);
    } catch {
      setSaved(prevSaved);
    } finally {
      setSaveLoading(false);
    }
  }, [saved, saveLoading, post.id]);

  const handleCommentsChange = useCallback(() => {
    getCommentCount(post.id).then(count => setCommentCount(count));
  }, [post.id]);

  // H3: Track delete timeout for proper cleanup
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDelete = useCallback(async () => {
    setShowMoreMenu(false);
    setDeleted(true);
    setShowUndoToast(true);
    const { error } = await deletePost(post.id);
    if (error) {
      // H3: Revert optimistic delete on API failure
      setDeleted(false);
      setShowUndoToast(false);
      return;
    }
    // H3: Track timeout so undo can clear it
    deleteTimerRef.current = setTimeout(() => {
      onDelete?.(post.id);
    }, 5000);
  }, [post.id, onDelete]);

  const handleUndoDelete = useCallback(async () => {
    // H3: Clear the pending delete timeout
    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    await restorePost(post.id);
    setDeleted(false);
    setShowUndoToast(false);
  }, [post.id]);

  // H3: Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    };
  }, []);

  // Build media array for carousel
  const mediaItems: MediaItem[] = post.media && post.media.length > 0
    ? post.media
    : (post.images || []).map((path, i) => ({
        id: `${post.id}-media-${i}`,
        storage_path: path,
        media_type: post.mediaTypes?.[i] || 'image',
        sort_order: i,
      }));

  if (deleted && !showUndoToast) return null;

  return (
    <>
      <article className="post-card border-b border-[var(--border-subtle)] px-4 py-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <Link href={`/profile/${post.user.username}`} className="flex-shrink-0">
            <Avatar src={post.user.avatar} name={post.user.displayName} size="md" />
          </Link>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <Link href={`/profile/${post.user.username}`} className="font-semibold text-[15px] text-[var(--text-primary)] hover:underline truncate">
                {post.user.displayName}
              </Link>
              {post.user.isVerified && (
                <svg aria-label="Verified" className="w-4 h-4 text-[var(--accent-primary)] flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143z" clipRule="evenodd" />
                </svg>
              )}
              <span className="text-[var(--text-muted)]">&middot;</span>
              <span className="text-xs text-[var(--text-muted)]">{formatTimeAgo(post.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <span>@{post.user.username}</span>
              {post.location && (
                <>
                  <span>&middot;</span>
                  <span>{post.location}</span>
                </>
              )}
            </div>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              aria-label="More options"
              className="p-2.5 rounded-full hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] transition-colors-fast"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
              </svg>
            </button>

            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-52 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl shadow-lg z-50 overflow-hidden">
                  {isOwnPost ? (
                    <>
                      <button onClick={() => { setShowEditModal(true); setShowMoreMenu(false); }} className="w-full px-4 py-3 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                        Edit
                      </button>
                      <button onClick={handleDelete} className="w-full px-4 py-3 text-left text-sm text-red-500 hover:bg-[var(--bg-secondary)] flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                        Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={async () => { await blockUser(post.user.id); setShowMoreMenu(false); }} className="w-full px-4 py-3 text-left text-sm text-red-500 hover:bg-[var(--bg-secondary)] flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></svg>
                        Block
                      </button>
                      <button onClick={async () => { await muteUser(post.user.id); setShowMoreMenu(false); }} className="w-full px-4 py-3 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                        Mute
                      </button>
                      <button onClick={() => { alert('Report submitted.'); setShowMoreMenu(false); }} className="w-full px-4 py-3 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" x2="4" y1="22" y2="15" /></svg>
                        Report
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Content — H7: Truncate long captions with expand/collapse */}
        {post.content && (
          <div className="mb-3">
            <p className={cn(
              'text-[15px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-line',
              !captionExpanded && captionNeedsTruncation && 'line-clamp-3'
            )}>
              {renderRichText(post.content)}
            </p>
            {captionNeedsTruncation && (
              <button
                onClick={() => setCaptionExpanded(!captionExpanded)}
                className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mt-1"
              >
                {captionExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
            {editedAt && (
              <p className="text-xs text-[var(--text-muted)] mt-1">edited</p>
            )}
          </div>
        )}

        {/* Media */}
        {mediaItems.length > 0 && (
          <div className="mb-3 rounded-xl overflow-hidden bg-[var(--bg-tertiary)] relative">
            <MediaCarousel
              media={mediaItems}
              onDoubleTap={handleMediaDoubleTap}
            />
            <HeartAnimation trigger={heartTrigger} />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 mt-2">
          <button
            onClick={handleLike}
            disabled={likeLoading}
            className={cn(
              'p-2 rounded-full transition-all duration-200 active:scale-90',
              liked ? 'text-[var(--destructive)]' : 'text-[var(--text-muted)] hover:text-[var(--destructive)] hover:bg-[var(--bg-tertiary)]',
              likeLoading && 'opacity-50'
            )}
            aria-label={liked ? 'Unlike' : 'Like'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
          </button>

          <button
            onClick={() => setShowComments(true)}
            className="p-2 rounded-full text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--bg-tertiary)] transition-all duration-200 active:scale-90"
            aria-label="Comments"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          <button
            onClick={() => setShowShare(true)}
            className="p-2 rounded-full text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-all duration-200 active:scale-90"
            aria-label="Share"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" x2="12" y1="2" y2="15" />
            </svg>
          </button>

          <button
            onClick={handleSave}
            disabled={saveLoading}
            className={cn(
              'p-2 rounded-full ml-auto transition-all duration-200 active:scale-90',
              saved ? 'text-amber-500' : 'text-[var(--text-muted)] hover:text-amber-500 hover:bg-[var(--bg-tertiary)]',
              saveLoading && 'opacity-50'
            )}
            aria-label={saved ? 'Unsave' : 'Save'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
            </svg>
          </button>
        </div>

        {/* Engagement Stats */}
        <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-secondary)] cursor-default">{formatNumber(likeCount)} likes</span>
          <button onClick={() => setShowComments(true)} className="hover:underline">
            <span className="font-semibold text-[var(--text-secondary)]">{formatNumber(commentCount)}</span> comments
          </button>
          {/* H8: Display share count */}
          {post.shares > 0 && (
            <span className="cursor-default">{formatNumber(post.shares)} shares</span>
          )}
        </div>
      </article>

      <CommentsModal postId={post.id} isOpen={showComments} onClose={() => setShowComments(false)} />

      <ShareModal postId={post.id} postAuthorName={post.user.displayName} isOpen={showShare} onClose={() => setShowShare(false)} />

      {showEditModal && (
        <EditPostModal
          postId={post.id}
          initialContent={post.content}
          initialLocation={post.location}
          onClose={() => setShowEditModal(false)}
          onSave={(updated) => {
            setShowEditModal(false);
            setEditedAt(updated.edited_at);
          }}
        />
      )}

      {showUndoToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl shadow-lg px-4 py-3 flex items-center gap-3">
          <span className="text-sm text-[var(--text-primary)]">Post deleted</span>
          <button onClick={handleUndoDelete} className="text-sm font-semibold text-[var(--accent-primary)] hover:underline">
            Undo
          </button>
        </div>
      )}
    </>
  );
};

export const PostCard = React.memo(PostCardInner);
