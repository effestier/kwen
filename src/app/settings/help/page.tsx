'use client';

import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/design-system';
import { BRAND } from '@/lib/brand/config';

export default function HelpPage() {
  const router = useRouter();

  const helpTopics = [
    {
      title: 'Getting Started',
      items: ['Creating an account', 'Setting up your profile', 'Finding friends']
    },
    {
      title: 'Using Stories',
      items: ['Creating a story', 'Adding music', 'Using filters', 'Sharing stories']
    },
    {
      title: 'Privacy & Security',
      items: ['Managing followers', 'Blocking users', 'Two-factor authentication']
    },
    {
      title: 'Account & Billing',
      items: ['Changing password', 'Updating email', 'Subscription plans']
    }
  ];

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        <span className="text-sm">Back to Settings</span>
      </button>

      <div className="mb-5">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Help</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Get help with using the app and find answers to common questions.
        </p>
      </div>

      <div className="space-y-3">
        {helpTopics.map((topic) => (
          <Card key={topic.title}>
            <CardHeader>
              <CardTitle>{topic.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {topic.items.map((item) => (
                  <li key={item} className="text-sm text-[var(--text-muted)]">
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle>Contact Support</CardTitle>
            <CardDescription>
              Can't find what you're looking for?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <a
                href={`mailto:${BRAND.social.supportEmail}`}
                className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors text-left block"
              >
                <div className="flex items-center gap-3 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent-primary)]">
                    <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <span className="font-medium text-[var(--text-primary)]">Email</span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">{BRAND.social.supportEmail}</p>
              </a>
              <a
                href={BRAND.social.website}
                target="_blank"
                rel="noopener noreferrer"
                className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors text-left block"
              >
                <div className="flex items-center gap-3 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent-primary)]">
                    <circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" />
                  </svg>
                  <span className="font-medium text-[var(--text-primary)]">Website</span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">{BRAND.domain}</p>
              </a>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Report a Problem</CardTitle>
            <CardDescription>
              Help us improve by reporting bugs or issues.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href={`mailto:${BRAND.social.supportEmail}?subject=Bug Report`}
              className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] transition-colors text-center block"
            >
              Report an Issue
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
