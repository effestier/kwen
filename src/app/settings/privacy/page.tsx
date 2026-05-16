'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/design-system';
import { Switch } from '@/components/design-system';
import { createClient } from '@/lib/supabase/client';

export default function PrivacyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    activity_status: true,
    story_replies: true,
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
        .select('activity_status, story_replies')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setSettings({
          activity_status: data.activity_status ?? true,
          story_replies: data.story_replies ?? true,
        });
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function updateSetting(key: string, value: boolean) {
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
      setSettings(prev => ({ ...prev, [key]: !value }));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full" />
      </div>
    );
  }

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
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Privacy</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Control who can see your content and interact with you.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Audience</CardTitle>
            <CardDescription>
              Who can see your posts and profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)]">
              <div>
                <p className="font-medium text-[var(--text-primary)]">Public</p>
                <p className="text-sm text-[var(--text-muted)]">Anyone can see your profile and posts</p>
              </div>
              <input type="radio" name="audience" defaultChecked className="accent-[var(--accent-primary)]" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)]">
              <div>
                <p className="font-medium text-[var(--text-primary)]">Followers Only</p>
                <p className="text-sm text-[var(--text-muted)]">Only your followers can see your posts</p>
              </div>
              <input type="radio" name="audience" className="accent-[var(--accent-primary)]" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)]">
              <div>
                <p className="font-medium text-[var(--text-primary)]">Private</p>
                <p className="text-sm text-[var(--text-muted)]">You must approve follow requests</p>
              </div>
              <input type="radio" name="audience" className="accent-[var(--accent-primary)]" />
            </div>
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
            <CardTitle>Story Settings</CardTitle>
            <CardDescription>
              Control who can view and interact with your stories.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Switch
              label="Allow Story Replies"
              description="Let people reply to your stories"
              checked={settings.story_replies}
              onChange={(e) => updateSetting('story_replies', e.target.checked)}
              disabled={saving}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blocked Accounts</CardTitle>
            <CardDescription>
              Manage accounts you've blocked.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--text-muted)] mb-4">You haven't blocked any accounts yet.</p>
            <button className="text-sm text-[var(--accent-primary)] hover:underline">
              Manage Blocked Accounts →
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data & Permissions</CardTitle>
            <CardDescription>
              Manage your data and connected apps.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-[var(--text-primary)]">Download Your Data</p>
                <p className="text-sm text-[var(--text-muted)]">Get a copy of your account data</p>
              </div>
              <button className="text-sm text-[var(--accent-primary)] hover:underline">Request</button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-[var(--text-primary)]">Connected Apps</p>
                <p className="text-sm text-[var(--text-muted)]">Manage third-party app access</p>
              </div>
              <button className="text-sm text-[var(--accent-primary)] hover:underline">Manage</button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}