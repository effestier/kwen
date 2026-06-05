'use client';

interface ReplyPreviewProps {
  senderName: string;
  content: string;
  messageType?: string;
  mediaUrl?: string | null;
  onCancel: () => void;
}

export function ReplyPreview({ senderName, content, messageType, mediaUrl, onCancel }: ReplyPreviewProps) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 bg-[var(--bg-tertiary)] rounded-xl mb-2">
      <div className="w-0.5 h-8 bg-[var(--accent-primary)] rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[var(--accent-primary)]">{senderName}</p>
        <p className="text-[13px] text-[var(--text-muted)] break-all leading-tight">
          {messageType === 'image' ? '📷 Photo' : content}
        </p>
      </div>
      {messageType === 'image' && mediaUrl && (
        <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <button
        onClick={onCancel}
        aria-label="Cancel reply"
        className="p-1 rounded-full hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
