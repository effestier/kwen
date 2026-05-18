'use client';

import Link from 'next/link';
import { BRAND } from '@/lib/brand/config';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-black">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--border-subtle)] bg-black/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] flex items-center justify-center">
              <span className="text-base font-semibold text-white">O</span>
            </div>
            <span className="text-lg font-semibold text-white tracking-tight">{BRAND.name}</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <Link href="/feed" className="text-sm text-[var(--text-secondary)] hover:text-white transition-colors-fast">Feed</Link>
            <Link href="/explore" className="text-sm text-[var(--text-secondary)] hover:text-white transition-colors-fast">Explore</Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-white transition-colors-fast">
              Sign in
            </Link>
            <Link href="/auth/register" className="px-5 py-2 text-sm font-medium rounded-full bg-[var(--accent-primary)] text-white hover:opacity-90 transition-opacity">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col">
        <section className="pt-40 pb-24 px-6">
          <div className="max-w-3xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)]" />
              <span className="text-xs text-[var(--text-secondary)]">Now in public beta</span>
            </div>

            {/* Heading */}
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-white mb-6 leading-[1.1]">
              Social, rebuilt for{' '}
              <span className="text-[var(--text-primary)]">people.</span>
            </h1>

            {/* Subheading */}
            <p className="text-lg text-[var(--text-secondary)] mb-10 max-w-xl mx-auto leading-relaxed">
              A platform designed for authentic connections. No algorithms deciding what you see. Just you and your community.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/auth/register" className="px-6 py-3 text-sm font-semibold rounded-full bg-[var(--accent-primary)] text-white hover:opacity-90 transition-opacity">
                Get started
              </Link>
              <Link href="/feed" className="px-6 py-3 text-sm font-medium rounded-full border border-[var(--border-soft)] text-white hover:bg-[var(--bg-tertiary)] transition-colors-fast">
                See the feed
              </Link>
            </div>
          </div>
        </section>

        {/* Preview */}
        <section className="py-16 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { name: 'Sarah', handle: 'sarahj', content: 'Just shipped a new feature to our design system. 47 new components, improved accessibility, and better performance.', likes: '2.8K', comments: '156' },
                  { name: 'Mike', handle: 'mikephoto', content: 'Golden hour hits different in Tokyo. The city never stops amazing me.', likes: '5.6K', comments: '234' },
                  { name: 'David', handle: 'davidlee', content: 'The best product design happens when you deeply understand your users.', likes: '1.9K', comments: '87' },
                ].map((post, i) => (
                  <div key={i} className="rounded-xl bg-[var(--bg-tertiary)] p-4">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--bg-elevated)]" />
                      <div>
                        <p className="text-sm font-medium text-white">{post.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">@{post.handle}</p>
                      </div>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] leading-snug mb-2 line-clamp-2">{post.content}</p>
                    <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                      <span>♥ {post.likes}</span>
                      <span>💬 {post.comments}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-20 px-6 border-t border-[var(--border-subtle)]">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-bold text-white mb-3">What makes us different</h2>
              <p className="text-[var(--text-secondary)]">Built for genuine connections, not engagement metrics.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                { title: 'No algorithms', desc: 'See posts in chronological order, the way social should work.' },
                { title: 'Privacy first', desc: 'Your data is yours. No tracking, no selling, no compromises.' },
                { title: 'Clean design', desc: 'No clutter, no clutter, no ads. Just your feed.' },
              ].map((f, i) => (
                <div key={i} className="text-center">
                  <h3 className="text-base font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-[var(--text-secondary)]">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 px-6">
          <div className="max-w-lg mx-auto text-center">
            <h2 className="text-2xl font-bold text-white mb-4">Ready to try something different?</h2>
            <p className="text-[var(--text-secondary)] mb-8">Join thousands already using {BRAND.name}.</p>
            <Link href="/auth/register" className="inline-flex px-6 py-3 text-sm font-semibold rounded-full bg-[var(--accent-primary)] text-white hover:opacity-90 transition-opacity">
              Create account
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border-subtle)] py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] flex items-center justify-center">
              <span className="text-sm font-semibold text-white">O</span>
            </div>
            <span className="text-sm font-medium text-[var(--text-secondary)]">{BRAND.name}</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-[var(--text-muted)]">
            <Link href="#" className="hover:text-[var(--text-secondary)] transition-colors-fast">Privacy</Link>
            <Link href="#" className="hover:text-[var(--text-secondary)] transition-colors-fast">Terms</Link>
          </div>
          <p className="text-xs text-[var(--text-muted)]">© {new Date().getFullYear()} {BRAND.name}</p>
        </div>
      </footer>
    </div>
  );
}