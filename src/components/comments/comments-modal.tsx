'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/avatar';
import { formatTimeAgo } from '@/lib/utils';
import { getComments, addComment, type Comment } from '@/app/actions/comments';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface CommentsModalProps {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
}

const EMOJI_CATEGORIES = {
  smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗'],
  gestures: ['👍', '👎', '👏', '🙌', '🤝', '🙏', '💪', '🤘', '👌', '✌️', '🤞', '🫶', '🤲', '🗣️'],
  hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘'],
  reactions: ['🔥', '✨', '💯', '🎉', '🎊', '🏆', '🎯', '💥', '⭐', '🌟', '💫', '🌈', '🌺', '🌸', '🌼', '🌻'],
};

export function CommentsModal({ postId, isOpen, onClose }: CommentsModalProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; avatar_url: string | null } | null>(null);
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
        if (profile) {
          setCurrentUser(profile);
        }
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
  }, [comments]);

  async function loadComments() {
    setLoading(true);
    try {
      const data = await getComments(postId);
      setComments(data);
    } catch (error) {
      console.error('[COMMENTS] Failed to load:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async () => {
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);

    // Optimistic add
    const tempId = `temp-${Date.now()}`;
    const tempComment: Comment = {
      id: tempId,
      post_id: postId,
      user_id: currentUser?.id || '',
      content: newComment.trim(),
      parent_id: null,
      created_at: new Date().toISOString(),
      user: {
        username: currentUser?.username || 'You',
        display_name: 'You',
        avatar_url: currentUser?.avatar_url || null,
      },
    };

    setComments(prev => [...prev, tempComment]);
    setNewComment('');

    try {
      const result = await addComment(postId, newComment.trim());

      if (result.success && result.comment) {
        // Replace temp comment with real one
        setComments(prev => prev.map(c => c.id === tempId ? result.comment! : c));
      } else {
        // Rollback on error
        setComments(prev => prev.filter(c => c.id !== tempId));
        setNewComment(newComment);
        alert(result.error || 'Failed to add comment');
      }
    } catch (error) {
      // Rollback
      setComments(prev => prev.filter(c => c.id !== tempId));
      setNewComment(newComment);
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

      // Restore cursor position
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
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

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
            className="p-2 rounded-full hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] transition-colors-fast"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Comments List */}
        <div
          ref={commentsListRef}
          className="overflow-y-auto max-h-[calc(85vh-140px)] sm:max-h-[calc(80vh-140px)] px-4 py-2"
        >
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
                <div key={comment.id} className="flex gap-3">
                  <Link
                    href={`/profile/${comment.user.username}`}
                    onClick={onClose}
                    className="flex-shrink-0"
                  >
                    <Avatar
                      src={comment.user.avatar_url}
                      name={comment.user.display_name}
                      size="sm"
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/profile/${comment.user.username}`}
                        onClick={onClose}
                        className="font-semibold text-sm text-[var(--text-primary)] hover:underline"
                      >
                        {comment.user.username}
                      </Link>
                      <span className="text-xs text-[var(--text-muted)]">
                        {formatTimeAgo(comment.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap break-words">
                      {comment.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-[var(--border-subtle)] p-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a comment..."
                className="w-full min-h-[44px] max-h-32 px-4 py-2.5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none focus:border-[var(--accent-primary)]"
                rows={1}
              />

              {/* Emoji Picker */}
              {showEmojiPicker && (
                <div className="absolute bottom-full left-0 mb-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-3 shadow-lg max-h-48 overflow-y-auto">
                  {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
                    <div key={category} className="mb-2">
                      <p className="text-xs text-[var(--text-muted)] capitalize mb-1">{category}</p>
                      <div className="flex flex-wrap gap-1">
                        {emojis.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => insertEmoji(emoji)}
                            className="p-1 hover:bg-[var(--bg-tertiary)] rounded text-lg transition-colors-fast"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={cn(
                'p-2.5 rounded-full transition-colors-fast',
                showEmojiPicker
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]'
              )}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" x2="9.01" y1="9" y2="9" /><line x1="15" x2="15.01" y1="9" y2="9" />
              </svg>
            </button>

            <button
              onClick={handleSubmit}
              disabled={!newComment.trim() || submitting}
              className={cn(
                'p-2.5 rounded-full transition-colors-fast',
                newComment.trim() && !submitting
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed'
              )}
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}