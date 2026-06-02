'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/avatar';
import { formatTimeAgo, formatNumber } from '@/lib/utils';
import { getComments, getReplies, addComment, toggleCommentLike, deleteComment, type Comment } from '@/services/comments';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { hapticLight } from '@/lib/haptics';
import { Skeleton } from '@/components/design-system/skeleton';

interface CommentsModalProps {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
}

const EMOJI_CATEGORIES = {
  smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗'],
  gestures: ['👍', '👎', '👏', '🙌', '🤝', '🙏', '💪', '🤘', '👌', '✌️', '🤞', '🫶'],
  hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❣️', '💕', '💞', '💓', '💗'],
  reactions: ['🔥', '✨', '💯', '🎉', '🎊', '🏆', '🎯', '💥', '⭐', '🌟', '💫', '🌈', '🌺'],
};

interface CommentItemProps {
  comment: Comment;
  currentUserId?: string;
  onReply: (comment: Comment) => void;
  onDelete: (commentId: string) => void;
  onLike: (commentId: string) => void;
  isReply?: boolean;
}

function CommentItem({ comment, currentUserId, onReply, onDelete, onLike, isReply }: CommentItemProps) {
  const isOwn = comment.user_id === currentUserId;

  return (
    <div className={cn('flex gap-2.5', isReply && 'pl-10')}>
      <Link href={`/profile/${comment.user.username}`} className="flex-shrink-0 mt-0.5">
        <Avatar src={comment.user.avatar_url} name={comment.user.display_name} size="sm" />
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link href={`/profile/${comment.user.username}`} className="font-semibold text-sm text-[var(--text-primary)] truncate">
            {comment.user.username}
          </Link>
          <span className="text-xs text-[var(--text-muted)] flex-shrink-0">{formatTimeAgo(comment.created_at)}</span>
        </div>
        <p className="selectable text-sm text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap break-words">
          {comment.content}
        </p>
        <div className="flex items-center gap-4 mt-1.5">
          <button
            onClick={() => onLike(comment.id)}
            className={cn(
              'flex items-center gap-1.5 py-0.5 -ml-1.5 px-1.5 rounded-md text-xs font-medium transition-all active:scale-90',
              comment.is_liked ? 'text-[var(--destructive)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={comment.is_liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
            {(comment.like_count ?? 0) > 0 && <span>{formatNumber(comment.like_count!)}</span>}
          </button>
          {!isReply && (
            <button
              onClick={() => onReply(comment)}
              className="py-0.5 px-1 -ml-1 rounded-md text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors-fast active:scale-90"
            >
              Reply
            </button>
          )}
          {isOwn && (
            <button
              onClick={() => onDelete(comment.id)}
              className="py-0.5 px-1 -ml-1 rounded-md text-xs font-medium text-[var(--text-muted)] hover:text-[var(--destructive)] transition-colors-fast active:scale-90"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CommentsModal({ postId, isOpen, onClose }: CommentsModalProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [repliesMap, setRepliesMap] = useState<Map<string, Comment[]>>(new Map());
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; avatar_url: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const commentsListRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  // Animate in on open
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      document.body.style.overflow = 'hidden';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Load current user
  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .eq('id', user.id)
          .single();
        if (profile) setCurrentUser(profile);
      }
    }
    if (isOpen) loadUser();
  }, [isOpen]);

  // Load comments when modal opens
  useEffect(() => {
    if (isOpen && postId) {
      loadComments();
    }
  }, [isOpen, postId]);

  // Scroll to bottom when comments change
  useEffect(() => {
    if (commentsListRef.current) {
      commentsListRef.current.scrollTop = commentsListRef.current.scrollHeight;
    }
  }, [comments, repliesMap]);

  // Keyboard viewport handling — scroll input into view when keyboard opens
  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => {
      if (inputRef.current && document.activeElement === inputRef.current) {
        setTimeout(() => {
          inputRef.current?.scrollIntoView({ block: 'end' });
        }, 100);
      }
    };

    window.visualViewport?.addEventListener('resize', handleResize);
    return () => window.visualViewport?.removeEventListener('resize', handleResize);
  }, [isOpen]);

  // Drag-to-close
  const handleSheetDragStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    // Don't drag if touching the input or comments list
    if (target.closest('textarea') || target.closest('[data-scrollable]')) return;
    dragStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  }, []);

  const handleSheetDragMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const diff = e.touches[0].clientY - dragStartY.current;
    setDragY(Math.max(0, diff));
  }, [isDragging]);

  const handleSheetDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragY > 120) {
      onClose();
    }
    setDragY(0);
  }, [isDragging, dragY, onClose]);

  async function loadComments() {
    setLoading(true);
    try {
      const data = await getComments(postId);
      setComments(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function loadReplies(parentId: string) {
    if (repliesMap.has(parentId)) return;
    const replies = await getReplies(parentId);
    setRepliesMap(prev => new Map(prev).set(parentId, replies));
  }

  function toggleThread(parentId: string) {
    const isExpanded = expandedThreads.has(parentId);
    if (!isExpanded) {
      loadReplies(parentId);
    }
    setExpandedThreads(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }

  const handleReply = (comment: Comment) => {
    setReplyingTo(comment);
    setNewComment(`@${comment.user.username} `);
    setShowEmojiPicker(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const cancelReply = () => {
    setReplyingTo(null);
    setNewComment('');
  };

  const handleLike = async (commentId: string) => {
    hapticLight();
    setComments(prev => prev.map(c => {
      if (c.id === commentId) {
        return { ...c, is_liked: !c.is_liked, like_count: (c.like_count ?? 0) + (c.is_liked ? -1 : 1) };
      }
      return c;
    }));
    setRepliesMap(prev => {
      const next = new Map(prev);
      for (const [parentId, replies] of next) {
        next.set(parentId, replies.map(r => {
          if (r.id === commentId) {
            return { ...r, is_liked: !r.is_liked, like_count: (r.like_count ?? 0) + (r.is_liked ? -1 : 1) };
          }
          return r;
        }));
      }
      return next;
    });

    const result = await toggleCommentLike(commentId);
    if (!result.success) {
      setComments(prev => prev.map(c => {
        if (c.id === commentId) {
          return { ...c, is_liked: !c.is_liked, like_count: (c.like_count ?? 0) + (c.is_liked ? -1 : 1) };
        }
        return c;
      }));
      setRepliesMap(prev => {
        const next = new Map(prev);
        for (const [parentId, replies] of next) {
          next.set(parentId, replies.map(r => {
            if (r.id === commentId) {
              return { ...r, is_liked: !r.is_liked, like_count: (r.like_count ?? 0) + (r.is_liked ? -1 : 1) };
            }
            return r;
          }));
        }
        return next;
      });
    }
  };

  const handleDelete = async (commentId: string) => {
    const removedComment = comments.find(c => c.id === commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
    setRepliesMap(prev => {
      const next = new Map(prev);
      for (const [parentId, replies] of next) {
        next.set(parentId, replies.filter(r => r.id !== commentId));
      }
      return next;
    });

    const result = await deleteComment(commentId);
    if (!result.success && removedComment) {
      setComments(prev => [...prev, removedComment].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ));
    }
  };

  const handleSubmit = async () => {
    if (!newComment.trim() || submitting) return;

    const commentText = newComment.trim();
    const parentId = replyingTo?.parent_id || replyingTo?.id || undefined;
    setSubmitting(true);
    setError(null);

    const tempId = `temp-${Date.now()}`;
    const tempComment: Comment = {
      id: tempId,
      post_id: postId,
      user_id: currentUser?.id || '',
      content: commentText,
      parent_id: parentId || null,
      created_at: new Date().toISOString(),
      user: {
        username: currentUser?.username || 'You',
        display_name: 'You',
        avatar_url: currentUser?.avatar_url || null,
      },
      reply_count: 0,
      like_count: 0,
      is_liked: false,
    };

    if (parentId) {
      setRepliesMap(prev => {
        const next = new Map(prev);
        const existing = next.get(parentId) || [];
        next.set(parentId, [...existing, tempComment]);
        return next;
      });
      setComments(prev => prev.map(c =>
        c.id === parentId ? { ...c, reply_count: (c.reply_count ?? 0) + 1 } : c
      ));
      setExpandedThreads(prev => new Set(prev).add(parentId));
    } else {
      setComments(prev => [...prev, tempComment]);
    }

    setNewComment('');
    setReplyingTo(null);
    setShowEmojiPicker(false);

    try {
      const result = await addComment(postId, commentText, parentId);

      if (result.success && result.comment) {
        if (parentId) {
          setRepliesMap(prev => {
            const next = new Map(prev);
            const existing = next.get(parentId) || [];
            next.set(parentId, existing.map(r => r.id === tempId ? result.comment! : r));
            return next;
          });
        } else {
          setComments(prev => prev.map(c => c.id === tempId ? result.comment! : c));
        }
      } else {
        if (parentId) {
          setRepliesMap(prev => {
            const next = new Map(prev);
            next.set(parentId, (next.get(parentId) || []).filter(r => r.id !== tempId));
            return next;
          });
          setComments(prev => prev.map(c =>
            c.id === parentId ? { ...c, reply_count: Math.max(0, (c.reply_count ?? 1) - 1) } : c
          ));
        } else {
          setComments(prev => prev.filter(c => c.id !== tempId));
        }
        setNewComment(commentText);
        setError(result.error || 'Failed to add comment');
        setTimeout(() => setError(null), 3000);
      }
    } catch {
      if (parentId) {
        setRepliesMap(prev => {
          const next = new Map(prev);
          next.set(parentId, (next.get(parentId) || []).filter(r => r.id !== tempId));
          return next;
        });
      } else {
        setComments(prev => prev.filter(c => c.id !== tempId));
      }
      setNewComment(commentText);
      setError('Something went wrong. Try again.');
      setTimeout(() => setError(null), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  const insertEmoji = (emoji: string) => {
    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const text = newComment;
      const newText = text.substring(0, start) + emoji + text.substring(end);
      setNewComment(newText);
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      setNewComment(prev => prev + emoji);
    }
    setShowEmojiPicker(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && replyingTo) {
      cancelReply();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col justify-end"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        style={{ opacity: isDragging ? Math.max(0, 1 - dragY / 300) : 1 }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        onTouchStart={handleSheetDragStart}
        onTouchMove={handleSheetDragMove}
        onTouchEnd={handleSheetDragEnd}
        className={cn(
          'relative flex flex-col bg-[var(--bg-primary)] rounded-t-2xl',
          'w-full max-w-lg mx-auto',
          'transition-transform duration-300 ease-out',
          isVisible && dragY === 0 ? 'translate-y-0' : '',
        )}
        style={{
          height: 'min(88dvh, 600px)',
          transform: isDragging ? `translateY(${dragY}px)` : undefined,
          transition: isDragging ? 'none' : undefined,
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0 cursor-grab active:cursor-grabbing">
          <div className="w-9 h-1 rounded-full bg-[var(--border-subtle)]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-subtle)] flex-shrink-0">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Comments</h2>
          <button
            onClick={onClose}
            aria-label="Close comments"
            className="p-1.5 -mr-1.5 rounded-full active:bg-[var(--bg-secondary)] text-[var(--text-muted)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        {/* Comments List — fills available space */}
        <div
          ref={commentsListRef}
          data-scrollable
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-3"
        >
          {loading ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton variant="circular" width={32} height={32} />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton variant="text" width="25%" />
                    <Skeleton variant="text" width="80%" />
                    <Skeleton variant="text" width="15%" />
                  </div>
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-muted)]">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="text-sm text-[var(--text-muted)]">No comments yet</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Be the first to comment</p>
            </div>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <div key={comment.id}>
                  <CommentItem
                    comment={comment}
                    currentUserId={currentUser?.id}
                    onReply={handleReply}
                    onDelete={handleDelete}
                    onLike={handleLike}
                  />

                  {(comment.reply_count ?? 0) > 0 && (
                    <button
                      onClick={() => toggleThread(comment.id)}
                      className="ml-12 mt-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors-fast flex items-center gap-1"
                    >
                      <div className="w-6 h-px bg-[var(--border-subtle)]" />
                      {expandedThreads.has(comment.id) ? 'Hide replies' : `View ${comment.reply_count} ${comment.reply_count === 1 ? 'reply' : 'replies'}`}
                    </button>
                  )}

                  {expandedThreads.has(comment.id) && repliesMap.has(comment.id) && (
                    <div className="mt-2 space-y-3 thread-expand">
                      {repliesMap.get(comment.id)!.map((reply) => (
                        <CommentItem
                          key={reply.id}
                          comment={reply}
                          currentUserId={currentUser?.id}
                          onReply={handleReply}
                          onDelete={handleDelete}
                          onLike={handleLike}
                          isReply
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-1.5 bg-[var(--destructive)]/10 flex-shrink-0">
            <p className="text-xs text-[var(--destructive)] text-center">{error}</p>
          </div>
        )}

        {/* Reply indicator */}
        {replyingTo && (
          <div className="px-4 py-1.5 bg-[var(--bg-secondary)] border-t border-[var(--border-subtle)] flex items-center justify-between flex-shrink-0">
            <p className="text-xs text-[var(--text-muted)] truncate">
              Replying to <span className="font-medium text-[var(--text-secondary)]">@{replyingTo.user.username}</span>
            </p>
            <button onClick={cancelReply} className="text-xs text-[var(--text-muted)] flex-shrink-0 ml-2">Cancel</button>
          </div>
        )}

        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-2 max-h-40 overflow-y-auto overscroll-contain flex-shrink-0">
            {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
              <div key={category} className="mb-1.5">
                <p className="text-[10px] text-[var(--text-muted)] capitalize mb-0.5 px-1">{category}</p>
                <div className="flex flex-wrap gap-0.5">
                  {emojis.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => insertEmoji(emoji)}
                      className="p-1.5 active:bg-[var(--bg-tertiary)] rounded text-base transition-colors-fast"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Input — sticky at bottom */}
        <div className="border-t border-[var(--border-subtle)] px-3 py-3 flex-shrink-0 bg-[var(--bg-primary)]" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <div className="flex items-end gap-2.5">
            {currentUser && (
              <Avatar src={currentUser.avatar_url} name={currentUser.username} size="sm" className="flex-shrink-0 mb-0.5" />
            )}
            <div className="flex-1 relative">
              <label htmlFor="comment-input" className="sr-only">{replyingTo ? `Reply to @${replyingTo.user.username}` : 'Add a comment'}</label>
              <textarea
                ref={inputRef}
                id="comment-input"
                value={newComment}
                onChange={(e) => { setNewComment(e.target.value); setError(null); }}
                onKeyDown={handleKeyDown}
                placeholder={replyingTo ? `Reply to @${replyingTo.user.username}...` : 'Add a comment...'}
                aria-label={replyingTo ? `Reply to @${replyingTo.user.username}` : 'Add a comment'}
                className="w-full min-h-[40px] max-h-24 px-4 py-2.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none focus:border-[var(--border-strong)]"
                rows={1}
              />
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                aria-label="Toggle emoji picker"
                className={cn(
                  'p-2 rounded-full transition-colors active:scale-95',
                  showEmojiPicker ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
                )}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" x2="9.01" y1="9" y2="9" /><line x1="15" x2="15.01" y1="9" y2="9" /></svg>
              </button>

              <button
                onClick={handleSubmit}
                disabled={!newComment.trim() || submitting}
                aria-label={replyingTo ? 'Post reply' : 'Post comment'}
                className={cn(
                  'p-2 rounded-full transition-all active:scale-95',
                  newComment.trim() && !submitting
                    ? 'text-[var(--accent-primary)]'
                    : 'text-[var(--text-muted)]/40 cursor-not-allowed'
                )}
              >
                {submitting ? (
                  <div className="w-[18px] h-[18px] border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
