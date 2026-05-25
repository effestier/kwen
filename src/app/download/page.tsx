'use client';

import { BRAND } from '@/lib/brand/config';

export default function DownloadPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black px-6">
      <div className="max-w-md w-full text-center space-y-5">
        {/* Logo */}
        <div className="w-20 h-20 rounded-2xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] flex items-center justify-center mx-auto">
          <span className="text-3xl font-semibold text-white">{BRAND.logo.symbol}</span>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Get the {BRAND.name} App</h1>
          <p className="text-[var(--text-muted)] text-sm">
            The full experience, right in your pocket.
          </p>
        </div>

        {/* Download button */}
        <a
          href="/kwen.apk"
          download
          className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-[var(--accent-primary)] text-[var(--text-inverse)] font-semibold text-lg hover:opacity-90 transition-opacity"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </svg>
          Download APK
        </a>

        {/* Info */}
        <div className="space-y-3 text-sm text-[var(--text-muted)]">
          <p>Android only &middot; 5.8 MB</p>
          <div className="flex items-center justify-center gap-4 text-xs">
            <span className="flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Secure
            </span>
            <span className="flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              Fast
            </span>
            <span className="flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              Free
            </span>
          </div>
        </div>

        {/* Install instructions */}
        <div className="pt-4 border-t border-[var(--border-subtle)]">
          <p className="text-xs text-[var(--text-muted)] mb-3">How to install:</p>
          <ol className="text-xs text-[var(--text-secondary)] space-y-1 text-left max-w-xs mx-auto">
            <li>1. Download the APK file</li>
            <li>2. Open it from your notifications or file manager</li>
            <li>3. Allow installation from unknown sources if prompted</li>
            <li>4. Open {BRAND.name} and sign in</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
