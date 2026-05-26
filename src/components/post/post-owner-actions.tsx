'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { deletePost, archivePost, toggleHideLikes, toggleDisableComments } from '@/services/posts';
import { ConfirmationDialog } from '@/components/design-system/modal';
import { pushOverlay, popOverlay } from '@/lib/overlay-stack';
import { hapticMedium } from '@/lib/haptics';

interface PostOwnerActionsSheetProps {
  postId: string;
  hideLikes: boolean;
  disableComments: boolean;
  onClose: () => void;
  onDeleted: () => void;
  onUpdated: (updates: { hideLikes?: boolean; disableComments?: boolean; archived?: boolean }) => void;
}

export function PostOwnerActionsSheet({
  postId,
  hideLikes,
  disableComments,
  onClose,
  onDeleted,
  onUpdated,
}: PostOwnerActionsSheetProps) {
  const router = useRouter();
  const [isHidingLikes, setIsHidingLikes] = useState(hideLikes);
  const [isDisablingComments, setIsDisablingComments] = useState(disableComments);
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    pushOverlay(onClose);
    return () => popOverlay();
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleToggleHideLikes = async () => {
    hapticMedium();
    setIsHidingLikes(prev => !prev);
    const result = await toggleHideLikes(postId);
    if (result.success) {
      onUpdated({ hideLikes: result.hideLikes ?? !hideLikes });
    } else {
      setIsHidingLikes(hideLikes);
    }
  };

  const handleToggleDisableComments = async () => {
    hapticMedium();
    setIsDisablingComments(prev => !prev);
    const result = await toggleDisableComments(postId);
    if (result.success) {
      onUpdated({ disableComments: result.disableComments ?? !disableComments });
    } else {
      setIsDisablingComments(disableComments);
    }
  };

  const handleArchive = async () => {
    hapticMedium();
    setLoading(true);
    const result = await archivePost(postId);
    setLoading(false);
    if (result.success) {
      onUpdated({ archived: true });
      onClose();
    }
  };

  const handleDelete = async () => {
    hapticMedium();
    setLoading(true);
    const result = await deletePost(postId);
    setLoading(false);
    if (result.success) {
      setShowDeleteConfirm(false);
      onDeleted();
      onClose();
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50 animate-fadeIn"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Sheet */}
        <div className="relative w-full max-w-lg bg-[var(--bg-primary)] rounded-t-2xl animate-slideInUp z-10">
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-[var(--text-muted)] opacity-30" />
          </div>

          <div className="pb-[env(safe-area-inset-bottom)]">
            {/* View Post */}
            <button
              onClick={() => { onClose(); router.push(`/post/${postId}`); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--bg-secondary)] transition-colors-fast text-left"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)]">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
              </svg>
              <span className="text-sm font-medium text-[var(--text-primary)]">View post</span>
            </button>

            <div className="h-px bg-[var(--border-subtle)] mx-4" />

            {/* Hide Likes Toggle */}
            <button
              onClick={handleToggleHideLikes}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--bg-secondary)] transition-colors-fast text-left"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)]">
                {isHidingLikes ? (
                  <>
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </>
                ) : (
                  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                )}
              </svg>
              <div className="flex-1">
                <span className="text-sm font-medium text-[var(--text-primary)]">Hide like count</span>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {isHidingLikes ? 'Likes are hidden from others' : 'Others can see how many likes this post has'}
                </p>
              </div>
              <div className={cn(
                'w-10 h-6 rounded-full transition-colors-fast relative flex-shrink-0',
                isHidingLikes ? 'bg-[var(--accent-primary)]' : 'bg-[var(--bg-tertiary)]'
              )}>
                <div className={cn(
                  'w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform-fast shadow-sm',
                  isHidingLikes ? 'translate-x-4' : 'translate-x-0.5'
                )} />
              </div>
            </button>

            <div className="h-px bg-[var(--border-subtle)] mx-4" />

            {/* Disable Comments Toggle */}
            <button
              onClick={handleToggleDisableComments}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--bg-secondary)] transition-colors-fast text-left"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)]">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                {isDisablingComments && <line x1="2" y1="2" x2="22" y2="22" />}
              </svg>
              <div className="flex-1">
                <span className="text-sm font-medium text-[var(--text-primary)]">Turn off commenting</span>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {isDisablingComments ? 'Comments are disabled' : 'Anyone can comment on this post'}
                </p>
              </div>
              <div className={cn(
                'w-10 h-6 rounded-full transition-colors-fast relative flex-shrink-0',
                isDisablingComments ? 'bg-[var(--accent-primary)]' : 'bg-[var(--bg-tertiary)]'
              )}>
                <div className={cn(
                  'w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform-fast shadow-sm',
                  isDisablingComments ? 'translate-x-4' : 'translate-x-0.5'
                )} />
              </div>
            </button>

            <div className="h-px bg-[var(--border-subtle)] mx-4" />

            {/* Archive */}
            <button
              onClick={handleArchive}
              disabled={loading}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--bg-secondary)] transition-colors-fast text-left disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)]">
                <rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" />
              </svg>
              <span className="text-sm font-medium text-[var(--text-primary)]">Archive</span>
            </button>

            <div className="h-px bg-[var(--border-subtle)] mx-4" />

            {/* Delete */}
            <button
              onClick={() => { hapticMedium(); setShowDeleteConfirm(true); }}
              disabled={loading}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--bg-secondary)] transition-colors-fast text-left disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--destructive)]">
                <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              <span className="text-sm font-medium text-[var(--destructive)]">Delete</span>
            </button>

            {/* Cancel */}
            <div className="h-2 bg-[var(--bg-secondary)]" />
            <button
              onClick={onClose}
              className="w-full py-3.5 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] transition-colors-fast"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete post?"
        message="This can't be undone. The post will be permanently deleted."
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        isLoading={loading}
      />
    </>
  );
}
