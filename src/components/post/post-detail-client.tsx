'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { cn, formatNumber, formatTimeAgo } from '@/lib/utils';
import { getPost, toggleLike, toggleSave } from '@/services/posts';
import { getComments, getReplies, addComment, toggleCommentLike, deleteComment, getCommentCount, type Comment } from '@/services/comments';
import { createClient } from '@/lib/supabase/client';
import { Spinner } from '@/components/ui/loader';

interface PostDetail {
  id: string;
  content: string | null;
  location: string | null;
  createdAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatar: string | null;
    isVerified: boolean;
  } | null;
  images: string[];
  mediaType: string[];
  likes: number;
  comments: number;
  isLiked: boolean;
  isSaved: boolean;
}

export function PostDetailClient({ postId }: { postId: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [saved, setSaved] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  const [comments, setComments] = useState<Comment[]>([]);
  const [repliesMap, setRepliesMap] = useState<Map<string, Comment[]>>(new Map());
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; avatar_url: string | null } | null>(null);
  const commentsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await getPost(postId);
      if (result.error || !result.post) {
        setError(result.error || 'Post not found');
        setLoading(false);
        return;
      }
      const p = result.post;
      setPost(p);
      setLiked(p.isLiked);
      setLikeCount(p.likes);
      setSaved(p.isSaved);
      setCommentCount(p.comments);
      setLoading(false);
    }
    load();
  }, [postId]);

  useEffect(() => {
    async function loadComments() {
      setCommentsLoading(true);
      const [commentsData, userData] = await Promise.all([
        getComments(postId),
        supabase.auth.getUser(),
      ]);
      setComments(commentsData);
      setCommentsLoading(false);

      if (userData.data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .eq('id', userData.data.user.id)
          .single();
        if (profile) setCurrentUser(profile);
      }
    }
    loadComments();
  }, [postId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') router.back();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  useEffect(() => {
    if (commentsRef.current) {
      commentsRef.current.scrollTop = commentsRef.current.scrollHeight;
    }
  }, [comments]);

  const handleLike = useCallback(async () => {
    if (actionLoading) return;
    setActionLoading(true);
    setLiked(prev => !prev);
    setLikeCount(prev => liked ? prev - 1 : prev + 1);
    try {
      await toggleLike(postId);
    } catch {
      setLiked(liked);
      setLikeCount(likeCount);
    } finally {
      setActionLoading(false);
    }
  }, [liked, likeCount, actionLoading, postId]);

  const handleSave = useCallback(async () => {
    if (actionLoading) return;
    setActionLoading(true);
    setSaved(prev => !prev);
    try {
      await toggleSave(postId);
    } catch {
      setSaved(saved);
    } finally {
      setActionLoading(false);
    }
  }, [saved, actionLoading, postId]);

  async function loadReplies(parentId: string) {
    if (repliesMap.has(parentId)) return;
    const replies = await getReplies(parentId);
    setRepliesMap(prev => new Map(prev).set(parentId, replies));
  }

  function toggleThread(parentId: string) {
    const isExpanded = expandedThreads.has(parentId);
    if (!isExpanded) loadReplies(parentId);
    setExpandedThreads(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }

  const handleReplyClick = (comment: Comment) => {
    setReplyingTo(comment);
    setNewComment(`@${comment.user.username} `);
    inputRef.current?.focus();
  };

  const handleCommentLike = async (commentId: string) => {
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, is_liked: !c.is_liked, like_count: (c.like_count ?? 0) + (c.is_liked ? -1 : 1) } : c));
    setRepliesMap(prev => {
      const next = new Map(prev);
      for (const [pid, replies] of next) {
        next.set(pid, replies.map(r => r.id === commentId ? { ...r, is_liked: !r.is_liked, like_count: (r.like_count ?? 0) + (r.is_liked ? -1 : 1) } : r));
      }
      return next;
    });
    const result = await toggleCommentLike(commentId);
    if (!result.success) {
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, is_liked: !c.is_liked, like_count: (c.like_count ?? 0) + (c.is_liked ? -1 : 1) } : c));
    }
  };

  const handleCommentDelete = async (commentId: string) => {
    setComments(prev => prev.filter(c => c.id !== commentId));
    setRepliesMap(prev => {
      const next = new Map(prev);
      for (const [pid, replies] of next) {
        next.set(pid, replies.filter(r => r.id !== commentId));
      }
      return next;
    });
    setCommentCount(prev => Math.max(0, prev - 1));
    await deleteComment(commentId);
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || submitting) return;
    const text = newComment.trim();
    const parentId = replyingTo?.parent_id || replyingTo?.id || undefined;
    setSubmitting(true);

    const tempId = `temp-${Date.now()}`;
    const temp: Comment = {
      id: tempId,
      post_id: postId,
      user_id: currentUser?.id || '',
      content: text,
      parent_id: parentId || null,
      created_at: new Date().toISOString(),
      user: { username: currentUser?.username || 'You', display_name: 'You', avatar_url: currentUser?.avatar_url || null },
      reply_count: 0, like_count: 0, is_liked: false,
    };

    if (parentId) {
      setRepliesMap(prev => new Map(prev).set(parentId, [...(prev.get(parentId) || []), temp]));
      setComments(prev => prev.map(c => c.id === parentId ? { ...c, reply_count: (c.reply_count ?? 0) + 1 } : c));
      setExpandedThreads(prev => new Set(prev).add(parentId));
    } else {
      setComments(prev => [...prev, temp]);
    }

    setNewComment('');
    setReplyingTo(null);
    setCommentCount(prev => prev + 1);

    try {
      const result = await addComment(postId, text, parentId);
      if (result.success && result.comment) {
        if (parentId) {
          setRepliesMap(prev => new Map(prev).set(parentId, (prev.get(parentId) || []).map(r => r.id === tempId ? result.comment! : r)));
        } else {
          setComments(prev => prev.map(c => c.id === tempId ? result.comment! : c));
        }
      } else {
        if (parentId) {
          setRepliesMap(prev => new Map(prev).set(parentId, (prev.get(parentId) || []).filter(r => r.id !== tempId)));
          setComments(prev => prev.map(c => c.id === parentId ? { ...c, reply_count: Math.max(0, (c.reply_count ?? 1) - 1) } : c));
        } else {
          setComments(prev => prev.filter(c => c.id !== tempId));
        }
        setCommentCount(prev => prev - 1);
        setNewComment(text);
      }
    } catch {
      if (parentId) {
        setRepliesMap(prev => new Map(prev).set(parentId, (prev.get(parentId) || []).filter(r => r.id !== tempId)));
      } else {
        setComments(prev => prev.filter(c => c.id !== tempId));
      }
      setCommentCount(prev => prev - 1);
      setNewComment(text);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCommentKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddComment();
    }
    if (e.key === 'Escape' && replyingTo) {
      setReplyingTo(null);
      setNewComment('');
    }
  };

  const renderContent = (text: string) => {
    return text.split(/(#\w+)/g).map((part, i) => {
      if (part.startsWith('#')) {
        return (
          <span key={i} className="text-[var(--accent-primary)] font-medium">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center gap-4">
        <p className="text-[var(--text-muted)]">{error || 'Post not found'}</p>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--text-inverse)] text-sm font-medium"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <header className="sticky top-0 z-40 bg-[var(--bg-primary)] border-b border-[var(--border-subtle)]">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="p-2 -ml-2 rounded-full hover:bg-[var(--bg-secondary)] transition-colors-fast"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
            </svg>
          </button>
          <h1 className="text-base font-semibold text-[var(--text-primary)]">Post</h1>
        </div>
      </header>

      <div className="max-w-5xl mx-auto">
        <div className="lg:flex lg:min-h-[calc(100vh-56px)]">
          <div className="lg:flex-1 lg:flex lg:items-center lg:justify-center bg-black/5 relative">
            {post.images.length > 0 ? (
              <div className="relative">
                <div className="aspect-square lg:aspect-auto lg:max-h-[calc(100vh-56px)] lg:w-full">
                  {post.mediaType[activeImage] === 'video' ? (
                    <video
                      src={post.images[activeImage]}
                      className="w-full h-full object-contain lg:object-cover"
                      controls
                      playsInline
                      autoPlay
                    />
                  ) : (
                    <img
                      src={post.images[activeImage]}
                      alt={`Post by ${post.user?.displayName || 'user'}`}
                      className="w-full h-full object-contain lg:object-cover"
                    />
                  )}
                </div>

                {post.images.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {post.images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveImage(i)}
                        aria-label={`Image ${i + 1}`}
                        className={cn(
                          'min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-all',
                        )}
                      >
                        <span className={cn(
                          'block rounded-full transition-all',
                          i === activeImage
                            ? 'w-4 h-4 bg-[var(--accent-primary)]'
                            : 'w-2 h-2 bg-white/50'
                        )} />
                      </button>
                    ))}
                  </div>
                )}

                {post.images.length > 1 && (
                  <>
                    {activeImage > 0 && (
                      <button
                        onClick={() => setActiveImage(prev => prev - 1)}
                        aria-label="Previous image"
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                      </button>
                    )}
                    {activeImage < post.images.length - 1 && (
                      <button
                        onClick={() => setActiveImage(prev => prev + 1)}
                        aria-label="Next image"
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="aspect-square lg:aspect-auto lg:min-h-[400px] flex items-center justify-center p-4">
                <p className="text-[var(--text-secondary)] text-lg whitespace-pre-wrap text-center max-w-md">
                  {post.content}
                </p>
              </div>
            )}
          </div>

          <div className="lg:w-[420px] lg:border-l border-t lg:border-t-0 border-[var(--border-subtle)] flex flex-col lg:h-[calc(100vh-56px)] lg:sticky lg:top-14">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
              {post.user && (
                <>
                  <Link href={`/profile/${post.user.username}`}>
                    <Avatar src={post.user.avatar} name={post.user.displayName} size="md" />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <Link href={`/profile/${post.user.username}`} className="font-semibold text-sm text-[var(--text-primary)] hover:underline truncate">
                        {post.user.displayName}
                      </Link>
                      {post.user.isVerified && (
                        <svg aria-label="Verified" className="w-4 h-4 text-[var(--accent-primary)] flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">@{post.user.username}</p>
                  </div>
                </>
              )}
            </div>

            <div ref={commentsRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {post.content && (
                <div className="flex gap-3">
                  {post.user && (
                    <Link href={`/profile/${post.user.username}`} className="flex-shrink-0">
                      <Avatar src={post.user.avatar} name={post.user.displayName} size="sm" />
                    </Link>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {post.user && (
                        <Link href={`/profile/${post.user.username}`} className="font-semibold text-sm text-[var(--text-primary)] hover:underline">
                          {post.user.username}
                        </Link>
                      )}
                      <span className="text-xs text-[var(--text-muted)]">{formatTimeAgo(post.createdAt)}</span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap break-words">
                      {renderContent(post.content)}
                    </p>
                    {post.location && (
                      <p className="text-xs text-[var(--text-muted)] mt-1">{post.location}</p>
                    )}
                  </div>
                </div>
              )}

              {commentsLoading ? (
                <div className="flex justify-center py-4">
                  <Spinner size="xs" color="muted" />
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-[var(--text-muted)] text-sm">No comments yet</p>
                  <p className="text-[var(--text-muted)] text-xs mt-1">Be the first to comment</p>
                </div>
              ) : (
                comments.map(comment => (
                  <div key={comment.id}>
                    <div className="flex gap-2.5">
                      <Link href={`/profile/${comment.user.username}`} className="flex-shrink-0 mt-0.5">
                        <Avatar src={comment.user.avatar_url} name={comment.user.display_name} size="sm" />
                      </Link>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Link href={`/profile/${comment.user.username}`} className="font-semibold text-sm text-[var(--text-primary)] hover:underline">
                            {comment.user.username}
                          </Link>
                          <span className="text-xs text-[var(--text-muted)]">{formatTimeAgo(comment.created_at)}</span>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap break-words">{comment.content}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <button onClick={() => handleCommentLike(comment.id)} className={cn('text-xs font-medium transition-colors-fast', comment.is_liked ? 'text-[var(--destructive)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]')}>
                            {comment.is_liked ? 'Liked' : 'Like'}{(comment.like_count ?? 0) > 0 && ` · ${comment.like_count}`}
                          </button>
                          <button onClick={() => handleReplyClick(comment)} className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors-fast">Reply</button>
                          {comment.user_id === currentUser?.id && (
                            <button onClick={() => handleCommentDelete(comment.id)} className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--destructive)] transition-colors-fast">Delete</button>
                          )}
                        </div>
                      </div>
                    </div>

                    {(comment.reply_count ?? 0) > 0 && (
                      <button onClick={() => toggleThread(comment.id)} className="ml-10 mt-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors-fast flex items-center gap-1">
                        <div className="w-5 h-px bg-[var(--border-subtle)]" />
                        {expandedThreads.has(comment.id) ? 'Hide replies' : `View ${comment.reply_count} ${comment.reply_count === 1 ? 'reply' : 'replies'}`}
                      </button>
                    )}

                    {expandedThreads.has(comment.id) && repliesMap.has(comment.id) && (
                      <div className="mt-2 space-y-2.5">
                        {repliesMap.get(comment.id)!.map(reply => (
                          <div key={reply.id} className="flex gap-2.5 pl-10">
                            <Link href={`/profile/${reply.user.username}`} className="flex-shrink-0 mt-0.5">
                              <Avatar src={reply.user.avatar_url} name={reply.user.display_name} size="sm" />
                            </Link>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Link href={`/profile/${reply.user.username}`} className="font-semibold text-sm text-[var(--text-primary)] hover:underline">
                                  {reply.user.username}
                                </Link>
                                <span className="text-xs text-[var(--text-muted)]">{formatTimeAgo(reply.created_at)}</span>
                              </div>
                              <p className="text-sm text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap break-words">{reply.content}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <button onClick={() => handleCommentLike(reply.id)} className={cn('text-xs font-medium transition-colors-fast', reply.is_liked ? 'text-[var(--destructive)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]')}>
                                  {reply.is_liked ? 'Liked' : 'Like'}{(reply.like_count ?? 0) > 0 && ` · ${reply.like_count}`}
                                </button>
                                <button onClick={() => handleReplyClick(reply)} className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors-fast">Reply</button>
                                {reply.user_id === currentUser?.id && (
                                  <button onClick={() => handleCommentDelete(reply.id)} className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--destructive)] transition-colors-fast">Delete</button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-[var(--border-subtle)] px-4 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-5">
                  {/* Like */}
                  <button
                    onClick={handleLike}
                    disabled={actionLoading}
                    aria-label={liked ? 'Unlike' : 'Like'}
                    className={cn(
                      'flex items-center gap-1.5 transition-all active:scale-95',
                      liked ? 'text-[var(--destructive)]' : 'text-[var(--text-muted)] hover:text-[var(--destructive)]'
                    )}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                    </svg>
                    {likeCount > 0 && (
                      <span className="text-sm font-medium tabular-nums">{formatNumber(likeCount)}</span>
                    )}
                  </button>
                  {/* Comment */}
                  <button
                    onClick={() => inputRef.current?.focus()}
                    aria-label="Comment"
                    className="flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-all active:scale-95"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    {commentCount > 0 && (
                      <span className="text-sm font-medium tabular-nums">{formatNumber(commentCount)}</span>
                    )}
                  </button>
                  {/* Share */}
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/post/${post.id}`;
                      if (navigator.share) {
                        navigator.share({ title: `Post by ${post.user?.displayName || 'user'}`, url });
                      } else {
                        navigator.clipboard.writeText(url);
                      }
                    }}
                    aria-label="Share"
                    className="text-[var(--text-muted)] hover:text-[var(--success)] transition-all active:scale-95"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" x2="12" y1="2" y2="15" />
                    </svg>
                  </button>
                </div>
                {/* Save */}
                <button
                  onClick={handleSave}
                  disabled={actionLoading}
                  aria-label={saved ? 'Unsave' : 'Save'}
                  className={cn(
                    'transition-all active:scale-95',
                    saved ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--accent-primary)]'
                  )}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
                  </svg>
                </button>
              </div>
            </div>

            {replyingTo && (
              <div className="px-4 py-2 bg-[var(--bg-secondary)] border-t border-[var(--border-subtle)] flex items-center justify-between">
                <p className="text-xs text-[var(--text-muted)]">
                  Replying to <span className="font-medium text-[var(--text-secondary)]">@{replyingTo.user.username}</span>
                </p>
                <button onClick={() => { setReplyingTo(null); setNewComment(''); }} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">Cancel</button>
              </div>
            )}

            <div className="border-t border-[var(--border-subtle)] p-3">
              <div className="flex items-end gap-2">
                {currentUser && (
                  <Avatar src={currentUser.avatar_url} name={currentUser.username} size="sm" />
                )}
                <div className="flex-1">
                  <label htmlFor="post-comment" className="sr-only">{replyingTo ? `Reply to @${replyingTo.user.username}` : 'Add a comment'}</label>
                  <textarea
                    ref={inputRef}
                    id="post-comment"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={handleCommentKeyDown}
                    placeholder={replyingTo ? `Reply to @${replyingTo.user.username}...` : 'Add a comment...'}
                    aria-label={replyingTo ? `Reply to @${replyingTo.user.username}` : 'Add a comment'}
                    className="w-full min-h-[40px] max-h-24 px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none focus:border-[var(--border-strong)]"
                    rows={1}
                  />
                </div>
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || submitting}
                  aria-label={replyingTo ? 'Post reply' : 'Post comment'}
                  className={cn(
                    'p-2 rounded-full transition-all active:scale-90',
                    newComment.trim() && !submitting
                      ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)]'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed'
                  )}
                >
                  {submitting ? (
                    <div className="w-5 h-5 border-2 border-[var(--text-inverse)] border-t-transparent rounded-full animate-spin" />
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
      </div>
    </div>
  );
}
