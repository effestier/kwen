'use client';

import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/design-system';

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
        className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        <span className="text-sm">Back to Settings</span>
      </button>

      <div className="mb-8">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Help</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Get help with using the app and find answers to common questions.
        </p>
      </div>

      <div className="space-y-6">
        <div className="relative">
          <input
            type="search"
            placeholder="Search help articles..."
            className="w-full px-4 py-3 pl-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
          />
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
        </div>

        {helpTopics.map((topic) => (
          <Card key={topic.title}>
            <CardHeader>
              <CardTitle>{topic.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {topic.items.map((item) => (
                  <li key={item}>
                    <button className="text-sm text-[var(--accent-primary)] hover:underline text-left">
                      {item}
                    </button>
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
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors text-left">
                <div className="flex items-center gap-3 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent-primary)]">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="font-medium text-[var(--text-primary)]">Chat</span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">Talk to our support team</p>
              </button>
              <button className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors text-left">
                <div className="flex items-center gap-3 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent-primary)]">
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><path d="M3 9h18" /><path d="M9 21V9" />
                  </svg>
                  <span className="font-medium text-[var(--text-primary)]">Email</span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">Get help via email</p>
              </button>
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
            <button className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] transition-colors">
              Report an Issue
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}