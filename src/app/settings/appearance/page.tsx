'use client';

import { useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/design-system';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/design-system';

export default function AppearancePage() {
  const router = useRouter();

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
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Appearance</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Customize how the app looks on your device.
        </p>
      </div>

      <div className="space-y-3">
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
            <CardTitle>Accessibility</CardTitle>
            <CardDescription>
              Motion and contrast settings are available in Content settings.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
