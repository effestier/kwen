'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/design-system';
import { Switch } from '@/components/design-system';
import { createClient } from '@/lib/supabase/client';
import { SettingsSkeleton } from '@/components/design-system';

export default function NotificationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    push_enabled: true,
    likes_notifications: true,
    comments_notifications: true,
    follows_notifications: true,
    mentions_notifications: true,
    messages_notifications: true,
    email_enabled: false,
    weekly_digest: true,
    marketing_emails: false,
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
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setSettings({
          push_enabled: data.push_enabled ?? true,
          likes_notifications: data.likes_notifications ?? true,
          comments_notifications: data.comments_notifications ?? true,
          follows_notifications: data.follows_notifications ?? true,
          mentions_notifications: data.mentions_notifications ?? true,
          messages_notifications: data.messages_notifications ?? true,
          email_enabled: data.email_enabled ?? false,
          weekly_digest: data.weekly_digest ?? true,
          marketing_emails: data.marketing_emails ?? false,
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
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Notifications</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Choose how you want to be notified about activity.
        </p>
      </div>

      <div className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>Push Notifications</CardTitle>
            <CardDescription>
              Notifications sent to your device.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Switch
              label="Push Notifications"
              description="Enable push notifications on this device"
              checked={settings.push_enabled}
              onChange={(e) => updateSetting('push_enabled', e.target.checked)}
              disabled={saving}
            />
            <hr className="border-[var(--border-subtle)]" />
            <Switch
              label="Likes"
              description="When someone likes your post or story"
              checked={settings.likes_notifications}
              onChange={(e) => updateSetting('likes_notifications', e.target.checked)}
              disabled={saving || !settings.push_enabled}
            />
            <Switch
              label="Comments"
              description="When someone comments on your post"
              checked={settings.comments_notifications}
              onChange={(e) => updateSetting('comments_notifications', e.target.checked)}
              disabled={saving || !settings.push_enabled}
            />
            <Switch
              label="Follow Requests"
              description="When someone wants to follow you"
              checked={settings.follows_notifications}
              onChange={(e) => updateSetting('follows_notifications', e.target.checked)}
              disabled={saving || !settings.push_enabled}
            />
            <Switch
              label="Mentions"
              description="When someone mentions you in a post"
              checked={settings.mentions_notifications}
              onChange={(e) => updateSetting('mentions_notifications', e.target.checked)}
              disabled={saving || !settings.push_enabled}
            />
            <Switch
              label="Direct Messages"
              description="New messages in your inbox"
              checked={settings.messages_notifications}
              onChange={(e) => updateSetting('messages_notifications', e.target.checked)}
              disabled={saving || !settings.push_enabled}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Email Notifications</CardTitle>
            <CardDescription>
              Notifications sent to your email.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Switch
              label="Email Notifications"
              description="Receive notifications via email"
              checked={settings.email_enabled}
              onChange={(e) => updateSetting('email_enabled', e.target.checked)}
              disabled={saving}
            />
            <Switch
              label="Weekly Digest"
              description="Summary of activity from the past week"
              checked={settings.weekly_digest}
              onChange={(e) => updateSetting('weekly_digest', e.target.checked)}
              disabled={saving}
            />
            <Switch
              label="Marketing Emails"
              description="News, features, and tips"
              checked={settings.marketing_emails}
              onChange={(e) => updateSetting('marketing_emails', e.target.checked)}
              disabled={saving}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}