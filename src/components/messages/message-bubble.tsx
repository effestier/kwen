'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ReactionPicker } from './reaction-picker';
import { VoiceMessage } from './voice-message';

export type ActionKind = 'react' | 'reply' | 'copy' | 'delete-me' | 'delete-everyone' | 'report' | 'save';

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
  isLatestSeen: boolean;
  isNewestOutgoing: boolean;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (message: MessageBubbleData) => void;
  onDelete: (messageId: string, deleteForEveryone: boolean) => void;
  onCopy: (text: string) => void;
  onReport: (messageId: string) => void;
  onSaveMedia?: (mediaUrl: string, messageType: string, mediaPath?: string) => void;
  onImageClick?: (url: string) => void;
  onRefreshUrl?: (mediaPath: string) => Promise<string | null>;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatSeenTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Seen';
  if (diffMins < 60) return `Seen ${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Seen ${diffHours}h ago`;
  return `Seen ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

export function MessageBubble({ message, showAvatar, showTail, isLatestSeen, isNewestOutgoing, onReact, onReply, onDelete, onCopy, onReport, onSaveMedia, onImageClick, onRefreshUrl }: MessageBubbleProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTriggered = useRef(false);

  const isText = message.message_type === 'text' || message.message_type === 'mixed' || message.message_type === 'story_reply';
  const hasMedia = !isText;
  const reactions = message.reactions ?? {};
  const hasReactions = Object.keys(reactions).length > 0;

  const showReadReceipt = message.isMine && (
    (isLatestSeen && message.seen_at) ||
    (isNewestOutgoing && !message.seen_at && message.delivered_at) ||
    (isNewestOutgoing && !message.seen_at && !message.delivered_at)
  );
  const readReceiptText = message.seen_at
    ? formatSeenTime(message.seen_at)
    : message.delivered_at ? 'Delivered' : 'Sent';

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

  // Long press -> action sheet (mobile)
  const handleTouchStart = useCallback(() => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setShowActionSheet(true);
    }, 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleClick = useCallback(() => {
    if (longPressTriggered.current) { longPressTriggered.current = false; return; }
    if (showPicker) { setShowPicker(false); return; }
    if (showMenu) { setShowMenu(false); return; }
  }, [showPicker, showMenu]);

  const handleAction = useCallback((action: ActionKind) => {
    setShowActionSheet(false);
    setShowMenu(false);
    switch (action) {
      case 'react': setShowPicker(true); break;
      case 'reply': onReply(message); break;
      case 'copy': if (message.content) onCopy(message.content); break;
      case 'delete-me': onDelete(message.id, false); break;
      case 'delete-everyone': onDelete(message.id, true); break;
      case 'report': onReport(message.id); break;
      case 'save': if (message.media_url) onSaveMedia?.(message.media_url, message.message_type, message.media_path || undefined); break;
    }
  }, [message, onReply, onCopy, onDelete, onReport, onSaveMedia]);

  const handleReactionSelect = useCallback((emoji: string) => {
    onReact(message.id, emoji);
    setShowPicker(false);
  }, [message.id, onReact]);

  const menuItems = [
    { kind: 'reply' as ActionKind, label: 'Reply', icon: '↩️', show: true },
    { kind: 'copy' as ActionKind, label: 'Copy', icon: '📋', show: isText },
    { kind: 'save' as ActionKind, label: 'Save', icon: '💾', show: hasMedia },
    { kind: 'delete-me' as ActionKind, label: 'Delete for me', icon: '🗑️', show: true, destructive: true },
    { kind: 'delete-everyone' as ActionKind, label: 'Unsend', icon: '🗑️', show: message.isMine, destructive: true },
    { kind: 'report' as ActionKind, label: 'Report', icon: '⚠️', show: !message.isMine, destructive: true },
  ].filter(a => a.show);

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          'group/msg relative',
          message.isMine ? 'flex flex-row-reverse' : 'flex flex-row',
          hasReactions && 'mb-6'
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setShowPicker(false); }}
      >
        {/* Avatar */}
        {!message.isMine && (
          <div className="w-8 flex-shrink-0 self-end">
            {showAvatar && message.sender?.avatar_url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={message.sender.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
            )}
          </div>
        )}

        {/* Bubble + metadata column */}
        <div className={cn(
          'flex flex-col max-w-[78%] md:max-w-[min(65%,520px)]',
          message.isMine ? 'items-end' : 'items-start'
        )}>
          {/* Reply-to preview */}
          {message.reply_to && (
            <div className={cn(
              'mb-1 px-3 py-1.5 rounded-xl text-xs border-l-2 max-w-full',
              message.isMine ? 'bg-black/10 border-black/20' : 'bg-[var(--bg-tertiary)] border-[var(--text-muted)]/30'
            )}>
              <p className={`font-semibold text-[11px] ${message.isMine ? 'text-black/60' : 'text-[var(--accent-primary)]'}`}>
                {message.reply_to.senderName}
              </p>
              <p className={`truncate ${message.isMine ? 'text-black/40' : 'text-[var(--text-muted)]'}`}>
                {message.reply_to.messageType === 'image' ? '📷 Photo' : message.reply_to.content}
              </p>
            </div>
          )}

          {/* Bubble */}
          <div
            className={cn(
              'relative rounded-2xl px-3 py-[7px]',
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
                'whitespace-pre-wrap break-words',
                /^[\p{Emoji_Presentation}\p{Emoji}\u200d\ufe0f]{1,12}$/u.test(message.content) ? 'text-[2.5rem] leading-tight' : 'text-[15px] leading-[1.35]'
              )}>
                {message.content}
              </p>
            )}
          </div>

          {/* Metadata row — timestamp + seen */}
          <div className={cn(
            'flex items-center gap-1 mt-0.5',
            message.isMine ? 'justify-start' : 'justify-end'
          )}>
            <span className="text-[11px] text-[var(--text-muted)] opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150">
              {formatTime(message.createdAt)}
            </span>
            {showReadReceipt && (
              <span className={cn(
                'text-[11px] opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150',
                message.seen_at ? 'text-blue-400' : 'text-[var(--text-muted)]'
              )}>
                {readReceiptText}
              </span>
            )}
          </div>
        </div>

        {/* Desktop "..." button — sits beside bubble, visible on hover */}
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

        {/* Desktop dropdown menu */}
        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} aria-hidden="true" />
            <div
              role="menu"
              aria-label="Message actions"
              className={cn(
                'absolute z-50 top-full mt-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-xl py-1 min-w-[160px] animate-scaleIn',
                message.isMine ? 'left-0' : 'right-0'
              )}
            >
              {/* Quick reactions */}
              <div className="flex items-center justify-center gap-0.5 px-2 py-1.5 border-b border-[var(--border-subtle)]">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={(e) => { e.stopPropagation(); onReact(message.id, emoji); setShowMenu(false); }}
                    className={cn(
                      'w-8 h-8 flex items-center justify-center rounded-full text-lg transition-all hover:scale-125 active:scale-95',
                      message.my_reaction === emoji ? 'bg-[var(--accent-primary)]/15 scale-110' : 'hover:bg-[var(--bg-tertiary)]'
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              {menuItems.map((action) => (
                <button
                  key={action.kind}
                  role="menuitem"
                  onClick={(e) => { e.stopPropagation(); handleAction(action.kind); }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors text-sm',
                    action.destructive
                      ? 'hover:bg-[var(--destructive)]/10 text-[var(--destructive)]'
                      : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                  )}
                >
                  <span className="text-base">{action.icon}</span>
                  <span>{action.label}</span>
                </button>
              ))}
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
            aria-label="Message actions"
            className="fixed bottom-0 left-0 right-0 z-[9999] bg-[var(--bg-secondary)] rounded-t-2xl pb-[max(0.75rem,env(safe-area-inset-bottom))] animate-slide-in-from-bottom"
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
