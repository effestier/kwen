'use client';

import { useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/design-system';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/design-system';

export default function AppearancePage() {
  const router = useRouter();

  return (
    <div className="max-w-2xl">
      {/* Back Navigation */}
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
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Appearance</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Customize how the app looks on your device.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Theme</CardTitle>
            <CardDescription>
              Choose your preferred color scheme.
            </CardDescription>
          </CardHeader>
          <div className="pt-2">
            <ThemeToggle />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Display</CardTitle>
            <CardDescription>
              Additional display options coming soon.
            </CardDescription>
          </CardHeader>
          <div className="pt-2 text-sm text-[var(--text-muted)]">
            <ul className="space-y-2">
              <li>• Font scaling</li>
              <li>• Compact mode</li>
              <li>• Reduced motion</li>
              <li>• Language</li>
            </ul>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accessibility</CardTitle>
            <CardDescription>
              Settings for enhanced accessibility.
            </CardDescription>
          </CardHeader>
          <div className="pt-2 text-sm text-[var(--text-muted)]">
            <ul className="space-y-2">
              <li>• High contrast mode</li>
              <li>• Screen reader support</li>
              <li>• Keyboard navigation</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}