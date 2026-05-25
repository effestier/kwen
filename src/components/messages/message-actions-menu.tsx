'use client';

import { useEffect, useRef } from 'react';

export type ActionKind = 'react' | 'reply' | 'copy' | 'delete-me' | 'delete-everyone' | 'report' | 'save';

interface MessageActionsMenuProps {
  isMine: boolean;
  isText: boolean;
  onAction: (action: ActionKind) => void;
  onClose: () => void;
  variant: 'mobile' | 'desktop';
}

export function MessageActionsMenu({ isMine, isText, onAction, onClose, variant }: MessageActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Focus trap + ESC close
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const focusable = menu.querySelectorAll<HTMLElement>('button');
    focusable[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const focused = document.activeElement;
        const idx = Array.from(focusable).indexOf(focused as HTMLInputElement);
        focusable[(idx + 1) % focusable.length]?.focus();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const focused = document.activeElement;
        const idx = Array.from(focusable).indexOf(focused as HTMLInputElement);
        focusable[(idx - 1 + focusable.length) % focusable.length]?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const hasMedia = !isText;

  const actions = [
    { kind: 'react' as ActionKind, label: 'React', icon: '😊', show: true },
    { kind: 'reply' as ActionKind, label: 'Reply', icon: '↩️', show: true },
    { kind: 'copy' as ActionKind, label: 'Copy', icon: '📋', show: isText },
    { kind: 'save' as ActionKind, label: 'Save media', icon: '💾', show: hasMedia },
    { kind: 'delete-me' as ActionKind, label: 'Delete for me', icon: '🗑️', show: true },
    { kind: 'delete-everyone' as ActionKind, label: 'Unsend', icon: '🗑️', show: isMine },
    { kind: 'report' as ActionKind, label: 'Report', icon: '⚠️', show: !isMine },
  ].filter(a => a.show);

  if (variant === 'mobile') {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in duration-200"
          onClick={onClose}
          aria-hidden="true"
        />
        {/* Bottom sheet */}
        <div
          ref={menuRef}
          role="menu"
          aria-label="Message actions"
          className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-secondary)] border-t border-[var(--border-subtle)] rounded-t-2xl p-3 pb-6 animate-in slide-in-from-bottom duration-300"
        >
          <div className="w-10 h-1 bg-[var(--text-muted)]/30 rounded-full mx-auto mb-3" />
          <div className="space-y-1">
            {actions.map((action) => (
              <button
                key={action.kind}
                role="menuitem"
                onClick={() => { onAction(action.kind); onClose(); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                  action.kind === 'report' || action.kind === 'delete-me' || action.kind === 'delete-everyone'
                    ? 'hover:bg-[var(--destructive)]/10 text-[var(--destructive)]'
                    : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                }`}
              >
                <span className="text-lg">{action.icon}</span>
                <span className="text-sm font-medium">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </>
    );
  }

  // Desktop dropdown
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        ref={menuRef}
        role="menu"
        aria-label="Message actions"
        className="absolute z-50 right-0 top-full mt-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-xl py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-150"
      >
        {actions.map((action) => (
          <button
            key={action.kind}
            role="menuitem"
            onClick={() => { onAction(action.kind); onClose(); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors text-sm ${
              action.kind === 'report' || action.kind === 'delete-me' || action.kind === 'delete-everyone'
                ? 'hover:bg-[var(--destructive)]/10 text-[var(--destructive)]'
                : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
            }`}
          >
            <span className="text-base">{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
