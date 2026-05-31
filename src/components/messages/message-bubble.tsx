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
  selectedMessageId?: string | null;
  onSelectMessage?: (messageId: string | null) => void;
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

export function MessageBubble({ message, showAvatar, isLatestSeen, isNewestOutgoing, onReact, onReply, onDelete, onCopy, onReport, onSaveMedia, onImageClick, onRefreshUrl, selectedMessageId, onSelectMessage }: MessageBubbleProps) {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showDesktopMenu, setShowDesktopMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTriggered = useRef(false);

  const isText = message.message_type === 'text' || message.message_type === 'mixed' || message.message_type === 'story_reply';
  const hasMedia = !isText;
  const reactions = message.reactions ?? {};
  const hasReactions = Object.keys(reactions).length > 0;

  // Actions visible on desktop hover OR when desktop menu is open
  const showMeta = isHovered || showDesktopMenu;

  // Read receipt
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
    if (!showDesktopMenu && !showActionSheet) return;
    const handleOutsideClick = (e: Event) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDesktopMenu(false);
        setShowActionSheet(false);
        setShowReactionPicker(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [showDesktopMenu, showActionSheet]);

  // Long press -> Instagram-style action sheet (mobile only)
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

  // Tap on bubble — close any open pickers, no select behavior
  const handleClick = useCallback(() => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (showReactionPicker) {
      setShowReactionPicker(false);
      return;
    }
    if (showDesktopMenu) {
      setShowDesktopMenu(false);
      return;
    }
  }, [showReactionPicker, showDesktopMenu]);

  const handleAction = useCallback((action: ActionKind) => {
    setShowActionSheet(false);
    setShowDesktopMenu(false);
    switch (action) {
      case 'react': setShowReactionPicker(true); break;
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
    setShowReactionPicker(false);
  }, [message.id, onReact]);

  // Action sheet items (Instagram-style)
  const actionSheetItems = [
    { kind: 'react' as ActionKind, label: 'React', icon: '😊', show: true },
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
          'group relative',
          message.isMine ? 'flex flex-row-reverse' : 'flex flex-row',
          // Bottom margin for reaction pills so they don't overlap next message
          hasReactions && 'mb-6'
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setShowReactionPicker(false); }}
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

        {/* Bubble column */}
        <div className={cn(
          'flex flex-col max-w-[78%] md:max-w-[min(65%,520px)]',
          message.isMine ? 'items-end' : 'items-start'
        )}>
          {/* Reply-to preview */}
          {message.reply_to && (
            <div className={cn(
              'mb-1 px-3 py-1.5 rounded-lg text-xs border-l-2 max-w-full',
              message.isMine ? 'bg-black/10 border-black/20' : 'bg-[var(--bg-tertiary)] border-[var(--text-muted)]/50'
            )}>
              <p className={`font-semibold ${message.isMine ? 'text-black/60' : 'text-[var(--text-primary)]'}`}>
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
              'rounded-2xl px-3 py-2',
              message.isMine
                ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)] rounded-br-md'
                : 'bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-bl-md'
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
              <p className={`text-[10px] italic mb-1 ${message.isMine ? 'text-white/50' : 'text-[var(--text-muted)]'}`}>
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
                /^[\p{Emoji_Presentation}\p{Emoji}\u200d\ufe0f]{1,12}$/u.test(message.content) ? 'text-4xl' : 'text-sm'
              )}>
                {message.content}
              </p>
            )}
          </div>

          {/* Metadata row — timestamp + desktop actions in same layer */}
          <div className={cn(
            'relative flex items-center h-5',
            message.isMine ? 'justify-start' : 'justify-end'
          )}>
            {/* Timestamp — pinned to outer edge */}
            <span className={cn(
              'text-[11px] text-[var(--text-muted)] transition-opacity duration-150',
              message.isMine ? 'order-1' : 'order-2',
              showMeta ? 'opacity-100' : 'opacity-0'
            )}>
              {formatTime(message.createdAt)}
            </span>

            {/* Desktop inline actions — absolutely positioned */}
            <div className={cn(
              'absolute top-1/2 -translate-y-1/2 flex items-center gap-0.5 transition-opacity duration-150 z-10 hidden md:flex',
              message.isMine ? 'right-0' : 'left-0',
              showMeta ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowReactionPicker(prev => !prev); }}
                aria-label="React"
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--bg-secondary)] active:bg-[var(--bg-secondary)] text-[var(--text-muted)] transition-colors text-xs"
              >
                😊
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onReply(message); }}
                aria-label="Reply"
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--bg-secondary)] active:bg-[var(--bg-secondary)] text-[var(--text-muted)] transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowDesktopMenu(prev => !prev); }}
                aria-label="More actions"
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--bg-secondary)] active:bg-[var(--bg-secondary)] text-[var(--text-muted)] transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
              </button>
            </div>
          </div>

          {/* Seen indicator — latest outgoing only */}
          {showReadReceipt && (
            <span className={cn(
              'text-[11px] text-[var(--text-muted)] transition-opacity duration-150',
              showMeta ? 'opacity-100' : 'opacity-0'
            )}>
              {readReceiptText}
            </span>
          )}
        </div>

        {/* Reactions pill — below everything */}
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
        {showReactionPicker && (
          <div className={cn(
            'absolute z-30 -top-12',
            message.isMine ? 'right-12' : 'left-12'
          )}>
            <ReactionPicker onSelect={handleReactionSelect} currentReaction={message.my_reaction} />
          </div>
        )}

        {/* Desktop dropdown menu */}
        {showDesktopMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowDesktopMenu(false)} aria-hidden="true" />
            <div
              role="menu"
              aria-label="Message actions"
              className={cn(
                'absolute z-50 top-full mt-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-xl py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-150',
                message.isMine ? 'left-0' : 'right-0'
              )}
            >
              {actionSheetItems.map((action) => (
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

      {/* Mobile action sheet — Instagram-style, rendered outside container */}
      {showActionSheet && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] animate-in fade-in duration-200"
            onClick={() => setShowActionSheet(false)}
            aria-hidden="true"
          />
          {/* Sheet */}
          <div
            role="dialog"
            aria-label="Message actions"
            className="fixed bottom-0 left-0 right-0 z-[9999] bg-[var(--bg-secondary)] border-t border-[var(--border-subtle)] rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-300"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-[var(--text-muted)]/30 rounded-full" />
            </div>

            {/* Message preview card */}
            <div className={cn(
              'mx-3 mb-3 p-3 rounded-xl border',
              message.isMine
                ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]/20'
                : 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)]'
            )}>
              <p className="text-xs font-medium text-[var(--text-muted)] mb-1">
                {message.isMine ? 'You' : (message.sender?.display_name || 'User')}
              </p>
              {message.media_url && (message.message_type === 'image' || message.message_type === 'mixed') && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={message.media_url} alt="" className="w-16 h-16 rounded-lg object-cover mb-1.5" />
              )}
              {message.content && message.message_type !== 'voice' && (
                <p className="text-sm text-[var(--text-primary)] line-clamp-3">{message.content}</p>
              )}
              {message.message_type === 'voice' && (
                <p className="text-sm text-[var(--text-muted)] italic">Voice message</p>
              )}
            </div>

            {/* Actions */}
            <div className="px-2">
              {actionSheetItems.map((action) => (
                <button
                  key={action.kind}
                  role="menuitem"
                  onClick={(e) => { e.stopPropagation(); handleAction(action.kind); }}
                  className={cn(
                    'w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-left transition-colors',
                    action.destructive
                      ? 'hover:bg-[var(--destructive)]/10 active:bg-[var(--destructive)]/15 text-[var(--destructive)]'
                      : 'hover:bg-[var(--bg-tertiary)] active:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                  )}
                >
                  <span className="text-lg w-6 text-center">{action.icon}</span>
                  <span className="text-sm font-medium">{action.label}</span>
                </button>
              ))}
            </div>

            {/* Cancel */}
            <div className="px-2 mt-1 border-t border-[var(--border-subtle)] pt-1">
              <button
                onClick={() => setShowActionSheet(false)}
                className="w-full py-3 rounded-xl text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] active:bg-[var(--bg-tertiary)] transition-colors"
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
