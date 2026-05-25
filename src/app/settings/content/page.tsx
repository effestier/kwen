'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/design-system';
import { Switch } from '@/components/design-system';
import { createClient } from '@/lib/supabase/client';
import { SettingsSkeleton } from '@/components/design-system';

export default function ContentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    suggested_posts: true,
    autoplay_videos: true,
    reduce_motion: false,
    high_contrast: false,
    language: 'en',
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
        .select('suggested_posts, autoplay_videos, reduce_motion, high_contrast, language')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setSettings({
          suggested_posts: data.suggested_posts ?? true,
          autoplay_videos: data.autoplay_videos ?? true,
          reduce_motion: data.reduce_motion ?? false,
          high_contrast: data.high_contrast ?? false,
          language: data.language ?? 'en',
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
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Content</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Customize your content experience and preferences.
        </p>
      </div>

      <div className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>Content Preferences</CardTitle>
            <CardDescription>
              Control what you see in your feed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Switch
              label="Show Suggested Posts"
              description="See recommended posts in your feed"
              checked={settings.suggested_posts}
              onChange={(e) => updateSetting('suggested_posts', e.target.checked)}
              disabled={saving}
            />
            <Switch
              label="Auto-play Videos"
              description="Videos play automatically when visible"
              checked={settings.autoplay_videos}
              onChange={(e) => updateSetting('autoplay_videos', e.target.checked)}
              disabled={saving}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Language</CardTitle>
            <CardDescription>
              Set your preferred language.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <select
              value={settings.language}
              onChange={(e) => updateSetting('language', e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--input-bg)] text-[var(--text-primary)]"
            >
              <option value="en">English (US)</option>
              <option value="en-gb">English (UK)</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="hi">Hindi</option>
            </select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accessibility</CardTitle>
            <CardDescription>
              Settings for enhanced accessibility.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Switch
              label="Reduce Motion"
              description="Minimize animations throughout the app"
              checked={settings.reduce_motion}
              onChange={(e) => updateSetting('reduce_motion', e.target.checked)}
              disabled={saving}
            />
            <Switch
              label="High Contrast"
              description="Increase contrast for better visibility"
              checked={settings.high_contrast}
              onChange={(e) => updateSetting('high_contrast', e.target.checked)}
              disabled={saving}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}