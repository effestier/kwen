'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/design-system';
import { Button } from '@/components/design-system';
import { Avatar } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { SettingsSkeleton } from '@/components/design-system';

interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
}

export default function AccountPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id, username, display_name, bio, avatar_url')
        .eq('id', user.id)
        .single();

      if (fetchError) throw fetchError;

      if (data) {
        setProfile(data);
        setDisplayName(data.display_name || '');
        setUsername(data.username || '');
        setBio(data.bio || '');
        setAvatarUrl(data.avatar_url);
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!profile) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          username: username.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''),
          bio: bio.trim(),
        })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);

      // Emit event to update navbar avatar
      window.dispatchEvent(new CustomEvent('profile-updated', {
        detail: { display_name: displayName, avatar_url: avatarUrl }
      }));
    } catch (err: any) {
      // Don't expose raw database error messages to users
      setError('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !profile) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be smaller than 5MB');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('No authenticated user');

      // Compress to WebP
      const compressedBlob = await new Promise<Blob>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 512;
          let w = img.naturalWidth, h = img.naturalHeight;
          if (w > maxDim || h > maxDim) {
            const scale = maxDim / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
          canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Compression failed')), 'image/webp', 0.85);
          URL.revokeObjectURL(img.src);
        };
        img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error('Failed to load image')); };
        img.src = URL.createObjectURL(file);
      });

      const fileName = `${Date.now()}.webp`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, compressedBlob, { upsert: true, contentType: 'image/webp' });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const publicUrl = urlData?.publicUrl;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);

      window.dispatchEvent(new CustomEvent('profile-updated', {
        detail: { display_name: displayName, avatar_url: publicUrl }
      }));
    } catch (err) {
      console.error('Error uploading avatar:', err);
      setError('Failed to upload avatar');
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRemoveAvatar() {
    if (!profile) return;

    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      setAvatarUrl(null);

      window.dispatchEvent(new CustomEvent('profile-updated', {
        detail: { display_name: displayName, avatar_url: null }
      }));
    } catch (err) {
      console.error('Error removing avatar:', err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <SettingsSkeleton />;
  }

  if (!profile) {
    return (
      <div className="max-w-2xl">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Account</h2>
        </div>
        <p className="text-[var(--text-muted)]">Please log in to manage your account.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Account</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Manage your personal information and account details.
        </p>
      </div>

      {error && (
        <div role="alert" aria-live="polite" className="mb-4 p-3 rounded-lg bg-[var(--destructive)]/10 border border-[var(--destructive)] text-[var(--destructive)] text-sm">
          {error}
        </div>
      )}

      {success && (
        <div role="status" aria-live="polite" className="mb-4 p-3 rounded-lg bg-[var(--success)]/10 border border-[var(--success)] text-[var(--success)] text-sm">
          Profile updated successfully!
        </div>
      )}

      <div className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>Profile Photo</CardTitle>
            <CardDescription>
              This will be displayed on your profile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar
                src={avatarUrl}
                name={displayName || username}
                size="xl"
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                >
                  Upload Photo
                </Button>
                {avatarUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveAvatar}
                    disabled={saving}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                aria-label="Upload profile photo"
                className="hidden"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Your public profile details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label htmlFor="settings-display-name" className="text-sm font-medium text-[var(--text-primary)]">Display Name</label>
              <input
                id="settings-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--input-bg)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-white/20"
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="settings-username" className="text-sm font-medium text-[var(--text-primary)]">Username</label>
              <div className="flex items-center">
                <span aria-hidden="true" className="px-3 py-2 rounded-l-lg border border-[var(--border-subtle)] border-r-0 bg-[var(--bg-secondary)] text-[var(--text-muted)] text-sm">
                  @
                </span>
                <input
                  id="settings-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  className="flex-1 px-3 py-2 rounded-r-lg border border-[var(--border-subtle)] bg-[var(--input-bg)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-white/20"
                  placeholder="username"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="settings-bio" className="text-sm font-medium text-[var(--text-primary)]">Bio</label>
              <textarea
                id="settings-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full min-h-[100px] px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent resize-none"
                placeholder="Tell us about yourself"
                maxLength={160}
              />
              <p className="text-xs text-[var(--text-muted)]">{bio.length}/160</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}