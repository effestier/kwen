'use client';

import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreatePostModal({ isOpen, onClose }: CreatePostModalProps) {
  const [content, setContent] = useState('');

  const handlePost = () => {
    setContent('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden rounded-2xl border-[var(--border-subtle)]">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors px-4 py-2 rounded-lg hover:bg-[var(--bg-secondary)]">
            Cancel
          </button>
          <h2 className="font-semibold text-[var(--text-primary)]">Create Post</h2>
          <button
            onClick={handlePost}
            disabled={!content.trim()}
            className="px-5 py-2 rounded-full bg-[var(--accent-primary)] text-[var(--text-inverse)] font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            Post
          </button>
        </div>

        <div className="p-4">
          <div className="flex gap-3">
            <div className="h-10 w-10 rounded-full bg-[var(--bg-tertiary)] flex-shrink-0" />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's happening?"
              className="flex-1 bg-transparent resize-none focus:outline-none min-h-[120px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              rows={5}
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg text-[var(--accent-primary)] hover:bg-[var(--bg-secondary)] transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
