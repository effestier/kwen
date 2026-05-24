'use client';

import { useState, useCallback } from 'react';
import { incrementShareCount } from '@/services/posts';

interface ShareModalProps {
  postId: string;
  postAuthorName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ShareModal({ postId, isOpen, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = useCallback(async () => {
    const url = `${window.location.origin}/post/${postId}`;
    // M20: Handle clipboard API errors (not available in insecure contexts)
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Fallback: copy via textarea (older browsers / insecure contexts)
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
    }
    await incrementShareCount(postId);
    setTimeout(() => {
      setCopied(false);
      onClose();
    }, 1200);
  }, [postId, onClose]);

  const handleNativeShare = useCallback(async () => {
    const url = `${window.location.origin}/post/${postId}`;
    try {
      await navigator.share({ url });
      await incrementShareCount(postId);
    } catch {
      // User cancelled
    }
    onClose();
  }, [postId, onClose]);

  const handleSendAsDM = useCallback(async () => {
    // H7: Increment share count BEFORE navigation (navigation kills JS context)
    await incrementShareCount(postId);
    onClose();
    window.location.href = `/messages?share=${postId}`;
  }, [postId, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 sm:inset-0 sm:flex sm:items-center sm:justify-center">
        <div className="bg-[var(--bg-primary)] rounded-t-2xl sm:rounded-2xl sm:max-w-sm w-full overflow-hidden animate-slideInUp">
          {/* Handle bar (mobile) */}
          <div className="flex justify-center py-2 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-[var(--border-soft)]" />
          </div>

          <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <h3 className="text-base font-semibold text-[var(--text-primary)] py-3 text-center">
              Share
            </h3>

            <div className="space-y-0.5">
              {/* Copy Link */}
              <button
                onClick={handleCopyLink}
                className="w-full flex items-center gap-3 py-3.5 px-4 rounded-xl hover:bg-[var(--bg-secondary)] transition-colors-fast active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
                  {copied ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--success)]">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)]">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  )}
                </div>
                <span className="text-[15px] text-[var(--text-primary)]">
                  {copied ? 'Copied!' : 'Copy link'}
                </span>
              </button>

              {/* Native Share */}
              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                <button
                  onClick={handleNativeShare}
                  className="w-full flex items-center gap-3 py-3.5 px-4 rounded-xl hover:bg-[var(--bg-secondary)] transition-colors-fast active:scale-[0.98]"
                >
                  <div className="w-10 h-10 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)]">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" x2="12" y1="2" y2="15" />
                    </svg>
                  </div>
                  <span className="text-[15px] text-[var(--text-primary)]">Share via...</span>
                </button>
              )}

              {/* Send as DM */}
              <button
                onClick={handleSendAsDM}
                className="w-full flex items-center gap-3 py-3.5 px-4 rounded-xl hover:bg-[var(--bg-secondary)] transition-colors-fast active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)]">
                    <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
                  </svg>
                </div>
                <span className="text-[15px] text-[var(--text-primary)]">Send as message</span>
              </button>
            </div>

            {/* Cancel */}
            <button
              onClick={onClose}
              className="w-full mt-3 py-3 rounded-xl bg-[var(--bg-secondary)] text-[var(--text-primary)] text-[15px] font-medium hover:bg-[var(--bg-tertiary)] transition-colors-fast active:scale-[0.98]"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
