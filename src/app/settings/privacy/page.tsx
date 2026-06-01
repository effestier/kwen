'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/design-system';
import { Switch } from '@/components/design-system';
import { createClient } from '@/lib/supabase/client';
import { SettingsSkeleton } from '@/components/design-system';

export default function PrivacyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    activity_status: true,
    story_replies: true,
    audience: 'public' as 'public' | 'followers' | 'private',
  });
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('user_settings')
        .select('activity_status, story_replies, audience')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setSettings({
          activity_status: data.activity_status ?? true,
          story_replies: data.story_replies ?? true,
          audience: data.audience ?? 'public',
        });
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function updateSetting(key: string, value: boolean | string) {
    setSaving(true);
    setSettings(prev => ({ ...prev, [key]: value }));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          [key]: value,
        }, { onConflict: 'user_id' });

      if (error) throw error;
    } catch (err) {
      console.error('Error saving setting:', err);
      // Revert on error
      loadSettings();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <SettingsSkeleton />;
  }

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
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Privacy</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Control who can see your content and interact with you.
        </p>
      </div>

      <div className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>Audience</CardTitle>
            <CardDescription>
              Who can see your posts and profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { value: 'public', label: 'Public', desc: 'Anyone can see your profile and posts' },
              { value: 'followers', label: 'Followers Only', desc: 'Only your followers can see your posts' },
              { value: 'private', label: 'Private', desc: 'You must approve follow requests' },
            ].map((option) => (
              <label
                key={option.value}
                className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                  settings.audience === option.value
                    ? 'bg-[var(--accent-secondary)] border border-[var(--accent-primary)]'
                    : 'bg-[var(--bg-secondary)] border border-transparent hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <div>
                  <p className="font-medium text-[var(--text-primary)]">{option.label}</p>
                  <p className="text-sm text-[var(--text-muted)]">{option.desc}</p>
                </div>
                <input
                  type="radio"
                  name="audience"
                  value={option.value}
                  checked={settings.audience === option.value}
                  onChange={() => updateSetting('audience', option.value)}
                  disabled={saving}
                  className="accent-[var(--accent-primary)]"
                />
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity Status</CardTitle>
            <CardDescription>
              Control visibility of your online status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Switch
              label="Show Activity Status"
              description="Let others see when you were last active"
              checked={settings.activity_status}
              onChange={(e) => updateSetting('activity_status', e.target.checked)}
              disabled={saving}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blocked Accounts</CardTitle>
            <CardDescription>
              Manage people you&apos;ve blocked.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/settings/blocked"
              className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><path d="m4.93 4.93 14.14 14.14" />
                </svg>
                <span className="text-sm font-medium text-[var(--text-primary)]">View blocked accounts</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Story Settings</CardTitle>
            <CardDescription>
              Control who can view and interact with your stories.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Switch
              label="Allow Story Replies"
              description="Let people reply to your stories"
              checked={settings.story_replies}
              onChange={(e) => updateSetting('story_replies', e.target.checked)}
              disabled={saving}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
