'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/avatar';
import { formatTimeAgo } from '@/lib/utils';
import { getComments, getReplies, addComment, toggleCommentLike, deleteComment, type Comment } from '@/app/actions/comments';
import Link from 'next/link';
import { cn } from '@/lib/utils';

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
          <Link href={`/profile/${comment.user.username}`} className="font-semibold text-sm text-[var(--text-primary)] hover:underline truncate">
            {comment.user.username}
          </Link>
          <span className="text-xs text-[var(--text-muted)] flex-shrink-0">{formatTimeAgo(comment.created_at)}</span>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap break-words">
          {comment.content}
        </p>
        <div className="flex items-center gap-3 mt-1">
          <button
            onClick={() => onLike(comment.id)}
            className={cn(
              'text-xs font-medium transition-colors-fast',
              comment.is_liked ? 'text-[var(--destructive)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            )}
          >
            {comment.is_liked ? 'Liked' : 'Like'}
            {(comment.like_count ?? 0) > 0 && ` · ${comment.like_count}`}
          </button>
          {!isReply && (
            <button
              onClick={() => onReply(comment)}
              className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors-fast"
            >
              Reply
            </button>
          )}
          {isOwn && (
            <button
              onClick={() => onDelete(comment.id)}
              className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--destructive)] transition-colors-fast"
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const commentsListRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

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
    loadUser();
  }, []);

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
    inputRef.current?.focus();
  };

  const cancelReply = () => {
    setReplyingTo(null);
    setNewComment('');
  };

  const handleLike = async (commentId: string) => {
    // Optimistic update in parent comments
    setComments(prev => prev.map(c => {
      if (c.id === commentId) {
        return {
          ...c,
          is_liked: !c.is_liked,
          like_count: (c.like_count ?? 0) + (c.is_liked ? -1 : 1),
        };
      }
      return c;
    }));

    // Optimistic update in replies
    setRepliesMap(prev => {
      const next = new Map(prev);
      for (const [parentId, replies] of next) {
        next.set(parentId, replies.map(r => {
          if (r.id === commentId) {
            return {
              ...r,
              is_liked: !r.is_liked,
              like_count: (r.like_count ?? 0) + (r.is_liked ? -1 : 1),
            };
          }
          return r;
        }));
      }
      return next;
    });

    const result = await toggleCommentLike(commentId);
    if (!result.success) {
      // Revert on failure
      setComments(prev => prev.map(c => {
        if (c.id === commentId) {
          return {
            ...c,
            is_liked: !c.is_liked,
            like_count: (c.like_count ?? 0) + (c.is_liked ? -1 : 1),
          };
        }
        return c;
      }));
    }
  };

  const handleDelete = async (commentId: string) => {
    // Optimistic remove
    const removedComment = comments.find(c => c.id === commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));

    // Also remove from replies if it's a reply
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
    const parentId = replyingTo?.id || replyingTo?.parent_id || undefined;
    setSubmitting(true);
    setError(null);

    // Optimistic add
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
      // Add to replies
      setRepliesMap(prev => {
        const next = new Map(prev);
        const existing = next.get(parentId) || [];
        next.set(parentId, [...existing, tempComment]);
        return next;
      });
      // Update reply count
      setComments(prev => prev.map(c =>
        c.id === parentId ? { ...c, reply_count: (c.reply_count ?? 0) + 1 } : c
      ));
      // Ensure thread is expanded
      setExpandedThreads(prev => new Set(prev).add(parentId));
    } else {
      setComments(prev => [...prev, tempComment]);
    }

    setNewComment('');
    setReplyingTo(null);

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
        // Rollback
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[var(--modal-backdrop)] backdrop-blur-sm" onClick={onClose} />

      {/* Modal Content */}
      <div className={cn(
        'relative w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)]',
        'sm:max-w-lg sm:rounded-2xl sm:max-h-[80vh]',
        'max-h-[85vh] rounded-t-3xl overflow-hidden',
        'animate-fadeInUp'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Comments</h2>
          <button
            onClick={onClose}
            aria-label="Close comments"
            className="p-2 rounded-full hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] transition-colors-fast"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        {/* Comments List */}
        <div ref={commentsListRef} className="overflow-y-auto max-h-[calc(85vh-140px)] sm:max-h-[calc(80vh-140px)] px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-[var(--text-muted)]">No comments yet</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">Be the first to comment</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id}>
                  {/* Parent Comment */}
                  <CommentItem
                    comment={comment}
                    currentUserId={currentUser?.id}
                    onReply={handleReply}
                    onDelete={handleDelete}
                    onLike={handleLike}
                  />

                  {/* View Replies Toggle */}
                  {(comment.reply_count ?? 0) > 0 && (
                    <button
                      onClick={() => toggleThread(comment.id)}
                      className="ml-12 mt-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors-fast flex items-center gap-1"
                    >
                      <div className="w-6 h-px bg-[var(--border-subtle)]" />
                      {expandedThreads.has(comment.id) ? 'Hide replies' : `View ${comment.reply_count} ${comment.reply_count === 1 ? 'reply' : 'replies'}`}
                    </button>
                  )}

                  {/* Replies */}
                  {expandedThreads.has(comment.id) && repliesMap.has(comment.id) && (
                    <div className="mt-2 space-y-3">
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

        {/* Error message */}
        {error && (
          <div className="px-4 py-2 bg-[var(--destructive)]/10 border-t border-[var(--destructive)]/20">
            <p className="text-xs text-[var(--destructive)] text-center">{error}</p>
          </div>
        )}

        {/* Reply indicator */}
        {replyingTo && (
          <div className="px-4 py-2 bg-[var(--bg-secondary)] border-t border-[var(--border-subtle)] flex items-center justify-between">
            <p className="text-xs text-[var(--text-muted)]">
              Replying to <span className="font-medium text-[var(--text-secondary)]">@{replyingTo.user.username}</span>
            </p>
            <button onClick={cancelReply} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
              Cancel
            </button>
          </div>
        )}

        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3 max-h-48 overflow-y-auto">
            {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
              <div key={category} className="mb-2">
                <p className="text-xs text-[var(--text-muted)] capitalize mb-1">{category}</p>
                <div className="flex flex-wrap gap-1">
                  {emojis.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => insertEmoji(emoji)}
                      className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded text-lg transition-colors-fast active:scale-95"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Input Area */}
        <div className="border-t border-[var(--border-subtle)] p-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="comment-input" className="sr-only">{replyingTo ? `Reply to @${replyingTo.user.username}` : 'Add a comment'}</label>
              <textarea
                ref={inputRef}
                id="comment-input"
                value={newComment}
                onChange={(e) => { setNewComment(e.target.value); setError(null); }}
                onKeyDown={handleKeyDown}
                placeholder={replyingTo ? `Reply to @${replyingTo.user.username}...` : 'Add a comment...'}
                aria-label={replyingTo ? `Reply to @${replyingTo.user.username}` : 'Add a comment'}
                className="w-full min-h-[44px] max-h-32 px-4 py-2.5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none focus:border-[var(--accent-primary)]"
                rows={1}
              />
            </div>

            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              aria-label="Toggle emoji picker"
              className={cn(
                'p-2.5 rounded-full transition-all duration-200 active:scale-95',
                showEmojiPicker ? 'bg-[var(--accent-primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]'
              )}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" x2="9.01" y1="9" y2="9" /><line x1="15" x2="15.01" y1="9" y2="9" /></svg>
            </button>

            <button
              onClick={handleSubmit}
              disabled={!newComment.trim() || submitting}
              aria-label={replyingTo ? 'Post reply' : 'Post comment'}
              className={cn(
                'p-2.5 rounded-full transition-all duration-200 active:scale-95',
                newComment.trim() && !submitting
                  ? 'bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-hover)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed'
              )}
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
