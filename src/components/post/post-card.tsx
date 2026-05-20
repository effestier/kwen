import { Post } from '@/types';
import { cn, formatNumber, formatTimeAgo } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { toggleLike as togglePostLike, toggleSave as togglePostSave } from '@/services/posts';
import { CommentsModal } from '@/components/comments/comments-modal';
import { getCommentCount } from '@/services/comments';
import { createClient } from '@/lib/supabase/client';

interface PostCardProps {
  post: Post;
}

export function PostCard({ post }: PostCardProps) {
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [saved, setSaved] = useState(post.isSaved);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comments);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  // Load comment count on mount
  useEffect(() => {
    async function loadCommentCount() {
      try {
        const count = await getCommentCount(post.id);
        setCommentCount(count);
      } catch (error) {
      }
    }
    loadCommentCount();

    // Subscribe to realtime comment updates (insert + delete for accurate counts)
    const channel = supabase
      .channel(`post-${post.id}-comments`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'comments',
        filter: `post_id=eq.${post.id}`
      }, () => {
        setCommentCount(prev => prev + 1);
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'comments',
        filter: `post_id=eq.${post.id}`
      }, () => {
        setCommentCount(prev => Math.max(0, prev - 1));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [post.id]);

  const handleLike = async () => {
    if (loading) return;
    setLoading(true);

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

          <button aria-label="More options" className="p-2.5 rounded-full hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] transition-colors-fast">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="mb-3">
          <p className="text-[15px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-line">
            {post.content}
          </p>
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
            onClick={() => {
              const url = `${window.location.origin}/post/${post.id}`;
              if (navigator.share) {
                navigator.share({ title: `Post by ${post.user.displayName}`, url });
              } else {
                navigator.clipboard.writeText(url);
              }
            }}
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
    </>
  );
}