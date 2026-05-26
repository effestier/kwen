'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ReactionPicker } from './reaction-picker';
import { MessageActionsMenu, type ActionKind } from './message-actions-menu';
import { VoiceMessage } from './voice-message';

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

export function MessageBubble({ message, showAvatar, onReact, onReply, onDelete, onCopy, onReport, onSaveMedia, onImageClick, onRefreshUrl, selectedMessageId, onSelectMessage }: MessageBubbleProps) {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTriggered = useRef(false);

  const isText = message.message_type === 'text' || message.message_type === 'mixed' || message.message_type === 'story_reply';
  const reactions = message.reactions ?? {};
  const hasReactions = Object.keys(reactions).length > 0;
  const isSelected = selectedMessageId === message.id;

  // Dismiss on click outside
  useEffect(() => {
    if (!isSelected && !showActions) return;
    const handleOutsideClick = (e: Event) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onSelectMessage?.(null);
        setShowActions(false);
        setShowReactionPicker(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [isSelected, showActions, onSelectMessage]);

  // Long press → actions menu (mobile)
  const handleTouchStart = useCallback(() => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setShowActions(true);
    }, 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Tap → select/deselect (mobile). Long press won't also trigger a tap.
  const handleClick = useCallback(() => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (showActions) {
      setShowActions(false);
      return;
    }
    if (showReactionPicker) {
      setShowReactionPicker(false);
      return;
    }
    onSelectMessage?.(isSelected ? null : message.id);
  }, [isSelected, showActions, showReactionPicker, message.id, onSelectMessage]);

  const handleAction = useCallback((action: ActionKind) => {
    setShowActions(false);
    onSelectMessage?.(null);
    switch (action) {
      case 'react':
        setShowReactionPicker(true);
        break;
      case 'reply':
        onReply(message);
        break;
      case 'copy':
        if (message.content) onCopy(message.content);
        break;
      case 'delete-me':
        onDelete(message.id, false);
        break;
      case 'delete-everyone':
        onDelete(message.id, true);
        break;
      case 'report':
        onReport(message.id);
        break;
      case 'save':
        if (message.media_url) onSaveMedia?.(message.media_url, message.message_type, message.media_path || undefined);
        break;
    }
  }, [message, onReply, onCopy, onDelete, onReport, onSaveMedia, onSelectMessage]);

  const handleReactionSelect = useCallback((emoji: string) => {
    onReact(message.id, emoji);
    setShowReactionPicker(false);
  }, [message.id, onReact]);

  // Actions + time visibility
  const showMeta = isHovered || isSelected || showActions;

  return (
    <div
      ref={containerRef}
      className={cn(
        'group relative flex gap-2',
        message.isMine ? 'flex-row-reverse' : 'flex-row'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setShowReactionPicker(false); }}
    >
      {/* Avatar */}
      {!message.isMine && (
        <div className="w-8 flex-shrink-0 self-end">
          {showAvatar && message.sender?.avatar_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={message.sender.avatar_url}
              alt=""
              className="w-8 h-8 rounded-full object-cover"
            />
          )}
        </div>
      )}

      {/* Row: actions + bubble + meta */}
      <div className={cn(
        'flex items-end gap-1.5 max-w-[75%]',
        message.isMine ? 'flex-row-reverse' : 'flex-row'
      )}>
        {/* Quick actions — outside bubble */}
        <div className={cn(
          'flex flex-col items-center gap-0.5 transition-opacity duration-150 self-end mb-1',
          showMeta ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}>
          <button
            onClick={() => { setShowReactionPicker(prev => !prev); }}
            aria-label="React"
            className="w-8 h-8 flex items-center justify-center rounded-full active:bg-[var(--bg-secondary)] text-[var(--text-muted)] transition-colors text-xs"
          >
            😊
          </button>
          <button
            onClick={() => onReply(message)}
            aria-label="Reply"
            className="w-8 h-8 flex items-center justify-center rounded-full active:bg-[var(--bg-secondary)] text-[var(--text-muted)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
          </button>
          <button
            onClick={() => setShowActions(prev => !prev)}
            aria-label="More actions"
            className="w-8 h-8 flex items-center justify-center rounded-full active:bg-[var(--bg-secondary)] text-[var(--text-muted)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
          </button>
        </div>

        {/* Bubble + timestamp column */}
        <div className={cn(
          'flex flex-col',
          message.isMine ? 'items-end' : 'items-start'
        )}>
          {/* Reply-to preview (above bubble) */}
          {message.reply_to && (
            <div className={cn(
              'mb-1 px-3 py-1.5 rounded-lg text-xs border-l-2 max-w-full',
              message.isMine
                ? 'bg-black/10 border-black/20'
                : 'bg-[var(--bg-tertiary)] border-[var(--text-muted)]/50'
            )}>
              <p className={`font-semibold ${message.isMine ? 'text-black/60' : 'text-[var(--text-primary)]'}`}>
                {message.reply_to.senderName}
              </p>
              <p className={`truncate ${message.isMine ? 'text-black/40' : 'text-[var(--text-muted)]'}`}>
                {message.reply_to.messageType === 'image' ? '📷 Photo' : message.reply_to.content}
              </p>
            </div>
          )}

          {/* Message bubble */}
          <div
            className={cn(
              'relative rounded-2xl px-3 py-2',
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
                <img
                  src={message.media_url}
                  alt="Story"
                  className="w-full h-28 object-cover"
                  loading="lazy"
                />
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
                <img
                  src={message.media_url}
                  alt="Shared photo"
                  className="w-full h-auto object-cover"
                  loading="lazy"
                />
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

            {/* Text content */}
            {message.content && message.content !== 'Photo' && message.message_type !== 'voice' && (
              <p className={cn(
                'whitespace-pre-wrap break-words',
                /^[\p{Emoji_Presentation}\p{Emoji}\u200d\ufe0f]{1,12}$/u.test(message.content)
                  ? 'text-4xl'
                  : 'text-sm'
              )}>
                {message.content}
              </p>
            )}
          </div>

          {/* Timestamp + read receipt — OUTSIDE bubble, always takes space */}
          <div className={cn(
            'flex items-center gap-1 mt-0.5 h-4 transition-opacity duration-150',
            message.isMine ? 'justify-end' : 'justify-start',
            showMeta ? 'opacity-100' : 'opacity-0'
          )}>
            <p className="text-[10px] text-[var(--text-muted)]">
              {formatTime(message.createdAt)}
            </p>
            {message.isMine && (
              <span className="text-[10px]" title={message.seen_at ? `Seen at ${new Date(message.seen_at).toLocaleTimeString()}` : message.delivered_at ? 'Delivered' : 'Sent'}>
                {message.seen_at ? (
                  <span className="text-blue-500">✓✓</span>
                ) : message.delivered_at ? (
                  <span className="text-[var(--text-muted)]">✓✓</span>
                ) : (
                  <span className="text-[var(--text-muted)]/60">✓</span>
                )}
              </span>
            )}
          </div>
        </div>
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
          <ReactionPicker
            onSelect={handleReactionSelect}
            currentReaction={message.my_reaction}
          />
        </div>
      )}

      {/* Actions menu */}
      {showActions && (
        <MessageActionsMenu
          isMine={message.isMine}
          isText={isText}
          onAction={handleAction}
          onClose={() => { setShowActions(false); onSelectMessage?.(null); }}
          variant={isHovered ? 'desktop' : 'mobile'}
        />
      )}
    </div>
  );
}
