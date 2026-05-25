'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/design-system';
import { BRAND } from '@/lib/brand/config';

export default function AboutPage() {
  const router = useRouter();

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => router.back()}
        aria-label="Back to Settings"
        className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        <span className="text-sm">Back to Settings</span>
      </button>

      <div className="mb-5">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">About</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Learn more about the app and find legal information.
        </p>
      </div>

      <div className="space-y-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] flex items-center justify-center">
                <span className="text-3xl text-white font-bold">{BRAND.logo.symbol}</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-[var(--text-primary)]">{BRAND.name}</h3>
                <p className="text-sm text-[var(--text-muted)]">Version 1.0.0</p>
              </div>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              A modern social platform built with Next.js and Supabase. Share moments, connect with friends, and discover new content.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resources</CardTitle>
            <CardDescription>
              Helpful links and information.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Privacy Policy', description: 'How we handle your data', href: '/privacy' },
              { label: 'Terms of Service', description: 'Rules and guidelines', href: '/terms' },
            ].map((item) => (
              <Link key={item.label} href={item.href} className="w-full flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors">
                <div>
                  <p className="font-medium text-[var(--text-primary)]">{item.label}</p>
                  <p className="text-sm text-[var(--text-muted)]">{item.description}</p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Developer Info</CardTitle>
            <CardDescription>
              Technical information about the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Framework</span>
              <span className="text-[var(--text-primary)] font-medium">Next.js 16</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Database</span>
              <span className="text-[var(--text-primary)] font-medium">Supabase</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Build</span>
              <span className="text-[var(--text-primary)] font-medium">Turbopack</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[var(--bg-secondary)]">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-[var(--text-muted)] mb-2">
              Made with love by KARAN-KWEN
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              © 2026 {BRAND.name}. All rights reserved.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}