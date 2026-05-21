import { Post } from '@/types';
import { cn, formatNumber, formatTimeAgo } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { toggleLike as togglePostLike, toggleSave as togglePostSave, deletePost, restorePost, blockUser, muteUser, incrementShareCount } from '@/services/posts';
import { hapticLight } from '@/lib/haptics';
import { getCommentCount } from '@/services/comments';
import { createClient } from '@/lib/supabase/client';
import { EditPostModal } from '@/components/post/edit-post-modal';
import { renderRichText } from '@/lib/text-utils';

const CommentsModal = dynamic(() => import('@/components/comments/comments-modal').then(mod => ({ default: mod.CommentsModal })), {
  loading: () => null,
  ssr: false,
});

interface PostCardProps {
  post: Post;
  isOwnPost?: boolean;
  onDelete?: (postId: string) => void;
}

export function PostCard({ post, isOwnPost = false, onDelete }: PostCardProps) {
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [saved, setSaved] = useState(post.isSaved);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comments);
  const [loading, setLoading] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [editedAt, setEditedAt] = useState<string | null>(null);
  const supabase = createClient();

  // Use comment count from feed RPC (no per-card subscription needed)
  useEffect(() => {
    setCommentCount(post.comments);
  }, [post.comments]);

  const handleLike = async () => {
    if (loading) return;
    setLoading(true);

    // Haptic feedback
    if (!liked) hapticLight();

    // Optimistic update
    setLiked(!liked);
    setLikeCount(liked ? likeCount - 1 : likeCount + 1);

    try {
      await togglePostLike(post.id);
    } catch {
      // Revert on error
      setLiked(liked);
      setLikeCount(likeCount);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (loading) return;
    setLoading(true);

    setSaved(!saved);

    try {
      await togglePostSave(post.id);
    } catch {
      setSaved(!saved);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenComments = () => {
    setShowComments(true);
  };

  const handleCloseComments = () => {
    setShowComments(false);
  };

  // Update comment count when modal closes (in case comments were added)
  const handleCommentsChange = () => {
    // Refresh comment count when modal closes
    getCommentCount(post.id).then(count => setCommentCount(count));
  };

  const handleDelete = async () => {
    setShowMoreMenu(false)
    setDeleted(true)
    setShowUndoToast(true)

    // Actually soft-delete on server
    await deletePost(post.id)

    // Auto-remove from UI after 5s if not undone
    setTimeout(() => {
      if (deleted) onDelete?.(post.id)
    }, 5000)
  }

  const handleUndoDelete = async () => {
    await restorePost(post.id)
    setDeleted(false)
    setShowUndoToast(false)
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/post/${post.id}`
    if (navigator.share) {
      await navigator.share({ title: `Post by ${post.user.displayName}`, url })
    } else {
      await navigator.clipboard.writeText(url)
    }
    await incrementShareCount(post.id)
  }

  if (deleted && !showUndoToast) return null

  return (
    <>
      <article className="post-card">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <Link href={`/profile/${post.user.username}`} className="flex-shrink-0">
            <Avatar
              src={post.user.avatar}
              name={post.user.displayName}
              size="md"
            />
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
              <span className="text-[var(--text-muted)]">·</span>
              <span className="text-xs text-[var(--text-muted)]">{formatTimeAgo(post.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <span>@{post.user.username}</span>
              {post.location && (
                <>
                  <span>·</span>
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

            {/* More menu */}
            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-52 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl shadow-lg z-50 overflow-hidden">
                  {isOwnPost ? (
                    <>
                      <button
                        onClick={() => { setShowEditModal(true); setShowMoreMenu(false) }}
                        className="w-full px-4 py-3 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] flex items-center gap-3"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                        Edit
                      </button>
                      <button
                        onClick={handleDelete}
                        className="w-full px-4 py-3 text-left text-sm text-red-500 hover:bg-[var(--bg-secondary)] flex items-center gap-3"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                        Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={async () => { await blockUser(post.user.id); setShowMoreMenu(false) }}
                        className="w-full px-4 py-3 text-left text-sm text-red-500 hover:bg-[var(--bg-secondary)] flex items-center gap-3"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" />
                        </svg>
                        Block
                      </button>
                      <button
                        onClick={async () => { await muteUser(post.user.id); setShowMoreMenu(false) }}
                        className="w-full px-4 py-3 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] flex items-center gap-3"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                        </svg>
                        Mute
                      </button>
                      <button
                        onClick={() => { alert('Report submitted.'); setShowMoreMenu(false) }}
                        className="w-full px-4 py-3 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] flex items-center gap-3"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" x2="4" y1="22" y2="15" />
                        </svg>
                        Report
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="mb-3">
          <p className="text-[15px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-line">
            {renderRichText(post.content)}
          </p>
          {editedAt && (
            <p className="text-xs text-[var(--text-muted)] mt-1">edited</p>
          )}
        </div>

        {/* Media */}
        {post.images && post.images.length > 0 && (
          <div className="mb-3 rounded-xl overflow-hidden bg-[var(--bg-tertiary)]">
            <div className={cn(
              'grid gap-0.5',
              post.images.length === 1 ? '' : 'grid-cols-2'
            )}>
              {post.images.slice(0, 4).map((image, i) => {
                const isVideo = post.mediaTypes?.[i] === 'video';
                return (
                  <div
                    key={i}
                    className={cn(
                      'overflow-hidden',
                      post.images!.length === 1 ? 'aspect-[4/5]' : 'aspect-square'
                    )}
                  >
                    {isVideo ? (
                      <video
                        src={image}
                        className="w-full h-full object-cover"
                        controls
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img
                        src={image}
                        alt={`Post image ${i + 1} by ${post.user.displayName}`}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 mt-2">
          <button
            onClick={handleLike}
            disabled={loading}
            className={cn(
              'p-2 rounded-full transition-all duration-200 active:scale-90',
              liked ? 'text-[var(--destructive)]' : 'text-[var(--text-muted)] hover:text-[var(--destructive)] hover:bg-[var(--bg-tertiary)]',
              loading && 'opacity-50'
            )}
            aria-label={liked ? 'Unlike' : 'Like'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
          </button>

          <button
            onClick={handleOpenComments}
            className="p-2 rounded-full text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--bg-tertiary)] transition-all duration-200 active:scale-90"
            aria-label="Comments"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          <button
            onClick={handleShare}
            className="p-2 rounded-full text-[var(--text-muted)] hover:text-[var(--success)] hover:bg-[var(--bg-tertiary)] transition-all duration-200 active:scale-90"
            aria-label="Share"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" x2="12" y1="2" y2="15" />
            </svg>
          </button>

          <button
            onClick={handleSave}
            disabled={loading}
            className={cn(
              'p-2 rounded-full ml-auto transition-all duration-200 active:scale-90',
              saved ? 'text-amber-500' : 'text-[var(--text-muted)] hover:text-amber-500 hover:bg-[var(--bg-tertiary)]',
              loading && 'opacity-50'
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
          <button onClick={handleOpenComments} className="hover:underline">
            <span className="font-semibold text-[var(--text-secondary)]">{formatNumber(commentCount)}</span> comments
          </button>
        </div>
      </article>

      {/* Comments Modal */}
      <CommentsModal
        postId={post.id}
        isOpen={showComments}
        onClose={handleCloseComments}
      />

      {/* Edit Post Modal */}
      {showEditModal && (
        <EditPostModal
          postId={post.id}
          initialContent={post.content}
          initialLocation={post.location}
          onClose={() => setShowEditModal(false)}
          onSave={(updated) => {
            setShowEditModal(false)
            setEditedAt(updated.edited_at)
          }}
        />
      )}

      {/* Undo delete toast */}
      {showUndoToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl shadow-lg px-4 py-3 flex items-center gap-3">
          <span className="text-sm text-[var(--text-primary)]">Post deleted</span>
          <button
            onClick={handleUndoDelete}
            className="text-sm font-semibold text-[var(--accent-primary)] hover:underline"
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
}