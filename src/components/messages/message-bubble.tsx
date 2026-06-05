'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ReactionPicker } from './reaction-picker';
import { VoiceMessage } from './voice-message';

export type ActionKind = 'react' | 'reply' | 'copy' | 'delete-me' | 'delete-everyone' | 'report' | 'save' | 'forward' | 'block';

export interface MessageBubbleData {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  isMine: boolean;
  sender: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
  message_type: string;
  media_url: string | null;
  thumbnail_url: string | null;
  reply_to: {
    id: string;
    content: string;
    senderName: string;
    messageType: string;
    media_url: string | null;
  } | null;
  reactions: Record<string, { count: number; userIds: string[] }>;
  my_reaction: string | null;
  status?: string;
  delivered_at?: string | null;
  seen_at?: string | null;
  story_id?: string | null;
  duration?: number | null;
  forwarded_from?: string | null;
  media_path?: string | null;
}

interface MessageBubbleProps {
  message: MessageBubbleData;
  showAvatar: boolean;
  showTail: boolean;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (message: MessageBubbleData) => void;
  onDelete: (messageId: string, deleteForEveryone: boolean) => void;
  onCopy: (text: string) => void;
  onReport: (messageId: string) => void;
  onBlock?: (userId: string) => void;
  onSaveMedia?: (mediaUrl: string, messageType: string, mediaPath?: string) => void;
  onImageClick?: (url: string) => void;
  onRefreshUrl?: (mediaPath: string) => Promise<string | null>;
  onForward?: (message: MessageBubbleData) => void;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
  return [...new Set(text.match(urlRegex) || [])];
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
}

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/i.test(url);
}

// Robust emoji-only detection: handles flags (regional indicators), skin tones,
// ZWJ sequences (👨‍👩‍👧‍👦), variation selectors, and keycaps (1️⃣).
function isEmojiOnly(text: string): boolean {
  // Strip whitespace and common invisible chars
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 30) return false;

  // Match full grapheme clusters: skin-tone ZWJ sequences, regional-indicator flags,
  // keycap sequences, and individual emoji with variation selectors.
  // This UAX #29–compliant pattern matches each "emoji unit" as one token.
  // UAX #29–compliant: matches flag pairs, emoji+modifiers, ZWJ chains (👨‍👩‍👧‍👦), keycaps
  const EMOJI_CLUSTER = /\p{RI}\p{RI}|\p{Emoji}(\p{EMod}|\u{FE0F}\u{20E3}?)?(?:\u{200D}\p{Emoji}(\p{EMod}|\u{FE0F}\u{20E3}?)?)*/gu;

  const replaced = trimmed.replace(EMOJI_CLUSTER, '');
  return replaced.trim().length === 0;
}

export function MessageBubble({ message, showAvatar, showTail, onReact, onReply, onDelete, onCopy, onReport, onBlock, onSaveMedia, onImageClick, onRefreshUrl, onForward }: MessageBubbleProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTriggered = useRef(false);
  const lastTapRef = useRef<number>(0);
  const [showHeart, setShowHeart] = useState(false);

  // Swipe-to-reply gesture
  const [swipeOffset, setSwipeOffset] = useState(0);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeActiveRef = useRef(false);
  const SWIPE_THRESHOLD = 60;
  const SWIPE_MAX = 100;

  const isText = message.message_type === 'text' || message.message_type === 'mixed' || message.message_type === 'story_reply';
  const hasMedia = !isText;
  const reactions = message.reactions ?? {};
  const hasReactions = Object.keys(reactions).length > 0;

  // Dismiss on click outside
  useEffect(() => {
    if (!showMenu && !showActionSheet) return;
    const handle = (e: Event) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setShowActionSheet(false);
        setShowPicker(false);
      }
    };
    document.addEventListener('pointerdown', handle);
    return () => document.removeEventListener('pointerdown', handle);
  }, [showMenu, showActionSheet]);

  // Long press -> action sheet (mobile) + swipe-to-reply
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    longPressTriggered.current = false;
    const touch = e.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
    swipeActiveRef.current = false;

    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      // Haptic feedback on long press
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(25);
      }
      setShowActionSheet(true);
    }, 500);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipeStartRef.current || longPressTriggered.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - swipeStartRef.current.x;
    const dy = touch.clientY - swipeStartRef.current.y;

    if (!swipeActiveRef.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swipeActiveRef.current = true;
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    }

    if (swipeActiveRef.current) {
      const direction = message.isMine ? -1 : 1;
      const offset = Math.max(0, Math.min(SWIPE_MAX, dx * direction));
      setSwipeOffset(offset);
    }
  }, [message.isMine]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (swipeActiveRef.current) {
      if (swipeOffset >= SWIPE_THRESHOLD) {
        onReply(message);
      }
      setSwipeOffset(0);
      swipeActiveRef.current = false;
    }
    swipeStartRef.current = null;
  }, [swipeOffset, message, onReply]);

  const handleClick = useCallback(() => {
    if (longPressTriggered.current) { longPressTriggered.current = false; return; }
    if (showPicker) { setShowPicker(false); return; }
    if (showMenu) { setShowMenu(false); return; }

    // Double-tap to react with heart (mobile)
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Haptic feedback on double-tap react
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([10, 30, 10]);
      }
      onReact(message.id, '❤️');
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 800);
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
  }, [showPicker, showMenu, message.id, onReact]);

  const handleAction = useCallback((action: ActionKind) => {
    setShowActionSheet(false);
    setShowMenu(false);
    switch (action) {
      case 'react': setShowPicker(true); break;
      case 'reply': onReply(message); break;
      case 'forward': onForward?.(message); break;
      case 'copy': if (message.content) onCopy(message.content); break;
      case 'delete-me': onDelete(message.id, false); break;
      case 'delete-everyone': onDelete(message.id, true); break;
      case 'report': onReport(message.id); break;
      case 'save': if (message.media_url) onSaveMedia?.(message.media_url, message.message_type, message.media_path || undefined); break;
      case 'block': if (message.senderId) onBlock?.(message.senderId); break;
    }
  }, [message, onReply, onCopy, onDelete, onReport, onBlock, onSaveMedia, onForward]);

  const handleReactionSelect = useCallback((emoji: string) => {
    onReact(message.id, emoji);
    setShowPicker(false);
  }, [message.id, onReact]);

  const menuItems = [
    { kind: 'reply' as ActionKind, label: 'Reply', icon: '↩️', show: true },
    { kind: 'forward' as ActionKind, label: 'Forward', icon: '↪️', show: true },
    { kind: 'copy' as ActionKind, label: 'Copy', icon: '📋', show: isText },
    { kind: 'save' as ActionKind, label: 'Save', icon: '💾', show: hasMedia },
    { kind: 'delete-me' as ActionKind, label: 'Delete for me', icon: '🗑️', show: true, destructive: true },
    { kind: 'delete-everyone' as ActionKind, label: 'Unsend', icon: '🗑️', show: message.isMine, destructive: true },
    { kind: 'report' as ActionKind, label: 'Report', icon: '⚠️', show: !message.isMine, destructive: true },
    { kind: 'block' as ActionKind, label: 'Block user', icon: '🚫', show: !message.isMine, destructive: true },
  ].filter(a => a.show);

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          'group/msg relative',
          message.isMine ? 'flex flex-row-reverse min-w-0' : 'flex flex-row min-w-0',
          hasReactions && 'mb-6'
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setShowPicker(false); }}
      >
        {/* Swipe reply icon — appears behind bubble */}
        {swipeOffset > 0 && (
          <div className={cn(
            'absolute top-1/2 -translate-y-1/2 z-0 flex items-center justify-center transition-opacity',
            message.isMine ? 'right-0' : 'left-0',
            swipeOffset >= SWIPE_THRESHOLD ? 'opacity-100' : 'opacity-50'
          )} style={{ width: 32, height: 32 }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={swipeOffset >= SWIPE_THRESHOLD ? 'var(--accent-primary)' : 'var(--text-muted)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="m10 8-3 3 3 3" /><path d="M13 11H7" />
            </svg>
          </div>
        )}

        {/* Bubble + metadata column */}
        <div className={cn(
          'flex flex-col max-w-[80%] md:max-w-[min(65%,480px)] min-w-0 relative z-10',
          message.isMine ? 'items-end' : 'items-start'
        )} style={{ transform: swipeOffset > 0 ? `translateX(${(message.isMine ? -1 : 1) * swipeOffset}px)` : undefined, transition: swipeActiveRef.current ? 'none' : 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}>
          {/* Reply-to preview */}
          {message.reply_to && (
            <div className={cn(
              'mb-1 px-3 py-1.5 rounded-xl text-xs border-l-2 max-w-full min-w-0 overflow-hidden',
              message.isMine ? 'bg-black/10 border-black/20' : 'bg-[var(--bg-tertiary)] border-[var(--text-muted)]/30'
            )}>
              <p className={`font-semibold text-[11px] truncate ${message.isMine ? 'text-black/60' : 'text-[var(--accent-primary)]'}`}>
                {message.reply_to.senderName}
              </p>
              <p className={`message-text ${message.isMine ? 'text-black/40' : 'text-[var(--text-muted)]'}`}>
                {message.reply_to.messageType === 'image' ? '📷 Photo' : message.reply_to.content}
              </p>
            </div>
          )}

          {/* Bubble */}
          <div
            className={cn(
              'relative rounded-2xl px-3 py-[7px] min-w-0',
              showTail && message.isMine && 'bubble-tail-outgoing rounded-br-sm',
              showTail && !message.isMine && 'bubble-tail-incoming rounded-bl-sm',
              !showTail && message.isMine && 'rounded-br-md',
              !showTail && !message.isMine && 'rounded-bl-md',
              message.isMine
                ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)]'
                : 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
            )}
            onClick={handleClick}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            {/* Story reply preview */}
            {message.message_type === 'story_reply' && message.media_url && (
              <div className="rounded-lg overflow-hidden mb-1.5 relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={message.media_url} alt="Story" className="w-full h-28 object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-1.5 left-2 flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                  <span className="text-white text-xs font-medium">Story</span>
                </div>
              </div>
            )}

            {/* Image */}
            {(message.message_type === 'image' || message.message_type === 'mixed') && message.media_url && (
              <div
                className="rounded-lg overflow-hidden mb-1 max-w-[280px] cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onImageClick?.(message.media_url!); }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={message.media_url} alt="Shared photo" className="w-full h-auto object-cover" loading="lazy" />
              </div>
            )}

            {/* Forwarded label */}
            {message.forwarded_from && (
              <p className={`text-[10px] italic mb-0.5 ${message.isMine ? 'text-white/50' : 'text-[var(--text-muted)]'}`}>
                ↪ Forwarded
              </p>
            )}

            {/* Voice message */}
            {message.message_type === 'voice' && message.media_url && message.media_path && (
              <VoiceMessage
                mediaUrl={message.media_url}
                duration={message.duration || 0}
                isMine={message.isMine}
                onRefreshUrl={onRefreshUrl ? () => onRefreshUrl(message.media_path!) : undefined}
              />
            )}

            {/* Text */}
            {message.content && message.content !== 'Photo' && message.message_type !== 'voice' && (
              <p className={cn(
                'message-text',
                isEmojiOnly(message.content) ? 'text-[2.5rem] leading-tight' : 'text-[15px] leading-[1.35]'
              )}>
                {message.content.split(/(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g).map((part, i) => {
                  if (/^https?:\/\//.test(part)) {
                    // Strip trailing punctuation that's likely not part of the URL
                    const cleanUrl = part.replace(/[.,;:!?)]+$/, '');
                    const displayText = cleanUrl.replace(/^https?:\/\//, '').split('/')[0] + (cleanUrl.replace(/^https?:\/\/[^\/]+/, '').length > 1 ? cleanUrl.replace(/^https?:\/\/[^\/]+/, '').split('?')[0].split('#')[0] : '');
                    return (
                      <a
                        key={i}
                        href={cleanUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          'message-link underline-offset-2 hover:underline',
                          message.isMine ? 'text-white/90 hover:text-white' : 'text-[var(--accent-primary)] hover:opacity-80'
                        )}
                      >
                        {displayText}
                      </a>
                    );
                  }
                  return part;
                })}
              </p>
            )}

            {/* Link preview */}
            {(() => {
              if (!message.content || message.message_type === 'voice') return null;
              const urls = extractUrls(message.content);
              if (urls.length === 0) return null;
              const url = urls[0];
              if (isImageUrl(url)) return null;
              const domain = getDomain(url);
              if (!domain) return null;
              return (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    'block mt-1.5 rounded-lg overflow-hidden border transition-colors-fast',
                    message.isMine
                      ? 'bg-white/10 border-white/20 hover:bg-white/15'
                      : 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)] hover:border-[var(--text-muted)]/30'
                  )}
                >
                  <div className="flex items-center gap-2.5 px-2.5 py-2">
                    <div className={cn(
                      'w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 text-sm',
                      message.isMine ? 'bg-white/15' : 'bg-[var(--bg-secondary)]'
                    )}>
                      🔗
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'text-xs font-medium truncate',
                        message.isMine ? 'text-white/90' : 'text-[var(--text-primary)]'
                      )}>
                        {domain}
                      </p>
                      <p className={cn(
                        'text-[11px] truncate mt-0.5',
                        message.isMine ? 'text-white/50' : 'text-[var(--text-muted)]'
                      )}>
                        {url.length > 60 ? url.slice(0, 60) + '…' : url}
                      </p>
                    </div>
                  </div>
                </a>
              );
            })()}

            {/* Double-tap heart animation */}
            {showHeart && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-5xl animate-double-tap-heart">❤️</span>
              </div>
            )}
          </div>

          {/* Metadata row — timestamp + status icon */}
          <div className={cn(
            'flex items-center gap-1 mt-0.5',
            message.isMine ? 'justify-start' : 'justify-end'
          )}>
            <span
              className={cn(
                "text-[11px] text-[var(--text-muted)] transition-opacity duration-150 select-none",
                showTail ? "opacity-100" : "opacity-0"
              )}
              title={new Date(message.createdAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            >
              {formatTime(message.createdAt)}
            </span>
            {message.isMine && (
              <span
                className={cn(
                  "transition-opacity duration-150 select-none",
                  showTail ? "opacity-100" : "opacity-0"
                )}
                title={
                  message.status === 'sending' ? 'Sending…' :
                  message.status === 'failed' ? 'Failed to send' :
                  message.seen_at ? `Seen ${formatTime(message.seen_at)}` :
                  message.delivered_at ? `Delivered ${formatTime(message.delivered_at)}` :
                  'Sent'
                }
              >
                {message.status === 'sending' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : message.status === 'failed' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--destructive)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
                  </svg>
                ) : message.seen_at ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 7 17l-5-5" /><path d="m22 10-9.5 9.5L10 17" />
                  </svg>
                ) : message.delivered_at ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 7 17l-5-5" /><path d="m22 10-9.5 9.5L10 17" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 7 17l-5-5" />
                  </svg>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Desktop "..." button */}
        <div className={cn(
          'hidden md:flex items-center self-center flex-shrink-0 transition-opacity duration-150',
          message.isMine ? 'mr-1' : 'ml-1',
          isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(prev => !prev); }}
            aria-label="Message actions"
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
            </svg>
          </button>
        </div>

        {/* Reactions pill */}
        {hasReactions && (
          <div className={cn(
            'absolute -bottom-5 flex flex-wrap gap-1',
            message.isMine ? 'right-12' : 'left-12'
          )}>
            {Object.entries(reactions).map(([emoji, data]) => (
              <button
                key={emoji}
                onClick={() => onReact(message.id, emoji)}
                aria-label={`${emoji} ${data.count} reaction${data.count > 1 ? 's' : ''}`}
                className={cn(
                  'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-colors',
                  message.my_reaction === emoji
                    ? 'bg-[var(--accent-primary)]/15 border-[var(--accent-primary)]/30'
                    : 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)] active:border-[var(--accent-primary)]/30'
                )}
              >
                <span>{emoji}</span>
                {data.count > 1 && <span className="text-[var(--text-muted)]">{data.count}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Reaction picker popup */}
        {showPicker && (
          <div className={cn(
            'absolute z-30 -top-12',
            message.isMine ? 'right-12' : 'left-12'
          )}>
            <ReactionPicker onSelect={handleReactionSelect} currentReaction={message.my_reaction} />
          </div>
        )}

        {/* Desktop centered popup menu (Instagram-style) */}
        {showMenu && (
          <>
            <div className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={() => setShowMenu(false)} aria-hidden="true" />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Message actions"
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] w-[min(320px,calc(100vw-2rem))] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl overflow-hidden animate-scaleIn"
            >
              {/* Message preview */}
              <div className={cn(
                'px-4 pt-4 pb-3',
                message.isMine ? 'bg-[var(--accent-primary)]/5' : ''
              )}>
                <p className="text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  {message.isMine ? 'You' : (message.sender?.display_name || 'User')}
                </p>
                {message.content && message.message_type !== 'voice' && (
                  <p className="text-sm text-[var(--text-primary)] line-clamp-2 leading-snug">{message.content}</p>
                )}
                {message.message_type === 'voice' && (
                  <p className="text-sm text-[var(--text-muted)] italic">Voice message</p>
                )}
                {message.media_url && (message.message_type === 'image' || message.message_type === 'mixed') && (
                  <p className="text-xs text-[var(--text-muted)] mt-1">📷 Photo</p>
                )}
              </div>

              {/* Quick reactions */}
              <div className="flex items-center justify-center gap-1 px-3 py-3 border-t border-[var(--border-subtle)]">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={(e) => { e.stopPropagation(); onReact(message.id, emoji); setShowMenu(false); }}
                    className={cn(
                      'w-10 h-10 flex items-center justify-center rounded-full text-xl transition-all hover:scale-125 active:scale-95',
                      message.my_reaction === emoji ? 'bg-[var(--accent-primary)]/15 scale-110' : 'hover:bg-[var(--bg-tertiary)]'
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <div className="h-px bg-[var(--border-subtle)]" />

              {/* Menu items */}
              <div className="py-1">
                {menuItems.map((action) => (
                  <button
                    key={action.kind}
                    role="menuitem"
                    onClick={(e) => { e.stopPropagation(); handleAction(action.kind); }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors text-[15px]',
                      action.destructive
                        ? 'active:bg-[var(--destructive)]/10 text-[var(--destructive)]'
                        : 'active:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    )}
                  >
                    <span className="text-base w-5 text-center">{action.icon}</span>
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>

              {/* Cancel */}
              <div className="border-t border-[var(--border-subtle)]">
                <button
                  onClick={() => setShowMenu(false)}
                  className="w-full py-3 text-[15px] font-semibold text-[var(--accent-primary)] active:bg-[var(--bg-tertiary)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Mobile action sheet */}
      {showActionSheet && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] animate-fadeIn"
            onClick={() => setShowActionSheet(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Message actions"
            className="fixed bottom-0 left-0 right-0 z-[9999] bg-[var(--bg-secondary)] rounded-t-2xl pb-[max(0.75rem,env(safe-area-inset-bottom))] animate-slide-in-from-bottom"
            onTouchStart={(e) => {
              const sheet = e.currentTarget;
              const startY = e.touches[0].clientY;
              const startTranslate = 0;
              const onMove = (ev: TouchEvent) => {
                const dy = ev.touches[0].clientY - startY;
                if (dy > 0) {
                  sheet.style.transform = `translateY(${dy}px)`;
                }
              };
              const onEnd = (ev: TouchEvent) => {
                const dy = ev.changedTouches[0].clientY - startY;
                if (dy > 80) {
                  setShowActionSheet(false);
                } else {
                  sheet.style.transform = '';
                }
                sheet.removeEventListener('touchmove', onMove);
                sheet.removeEventListener('touchend', onEnd);
              };
              sheet.addEventListener('touchmove', onMove, { passive: true });
              sheet.addEventListener('touchend', onEnd);
            }}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-9 h-1 bg-[var(--text-muted)]/20 rounded-full" />
            </div>

            {/* Message preview */}
            <div className={cn(
              'mx-3 mb-2.5 p-2.5 rounded-xl',
              message.isMine ? 'bg-[var(--accent-primary)]/8' : 'bg-[var(--bg-tertiary)]'
            )}>
              <p className="text-[11px] font-medium text-[var(--text-muted)] mb-0.5">
                {message.isMine ? 'You' : (message.sender?.display_name || 'User')}
              </p>
              {message.media_url && (message.message_type === 'image' || message.message_type === 'mixed') && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={message.media_url} alt="" className="w-14 h-14 rounded-lg object-cover mb-1" />
              )}
              {message.content && message.message_type !== 'voice' && (
                <p className="text-sm text-[var(--text-primary)] line-clamp-2 leading-snug">{message.content}</p>
              )}
              {message.message_type === 'voice' && (
                <p className="text-sm text-[var(--text-muted)] italic">Voice message</p>
              )}
            </div>

            {/* Quick reactions row */}
            <div className="flex items-center justify-center gap-1 px-3 mb-2">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => { onReact(message.id, emoji); setShowActionSheet(false); }}
                  className={cn(
                    'w-11 h-11 flex items-center justify-center rounded-full text-xl transition-all active:scale-90',
                    message.my_reaction === emoji
                      ? 'bg-[var(--accent-primary)]/15 scale-110'
                      : 'active:bg-[var(--bg-tertiary)]'
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className="h-px bg-[var(--border-subtle)] mx-3 mb-1" />

            {/* Actions */}
            <div className="px-1.5">
              {menuItems.map((action) => (
                <button
                  key={action.kind}
                  role="menuitem"
                  onClick={() => handleAction(action.kind)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-colors',
                    action.destructive
                      ? 'active:bg-[var(--destructive)]/10 text-[var(--destructive)]'
                      : 'active:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                  )}
                >
                  <span className="text-base w-5 text-center">{action.icon}</span>
                  <span className="text-[15px]">{action.label}</span>
                </button>
              ))}
            </div>

            <div className="px-1.5 mt-0.5">
              <button
                onClick={() => setShowActionSheet(false)}
                className="w-full py-2.5 rounded-xl text-[15px] font-semibold text-[var(--accent-primary)] active:bg-[var(--bg-tertiary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
