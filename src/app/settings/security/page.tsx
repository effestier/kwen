'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/design-system';
import { Button } from '@/components/design-system';
import { updatePassword } from '@/services/auth';

export default function SecurityPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function handlePasswordChange() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Password must contain at least one letter and one number');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const result = await updatePassword(currentPassword, newPassword);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Failed to update password. Please try again.');
    } finally {
      setSaving(false);
    }
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
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Security</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Keep your account secure and manage login options.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[var(--destructive)]/10 border border-[var(--destructive)] text-[var(--destructive)] text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 rounded-lg bg-[var(--success)]/10 border border-[var(--success)] text-[var(--success)] text-sm">
          Password updated successfully!
        </div>
      )}

      <div className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Change your account password.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--text-primary)]">Current Password</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--input-bg)] text-[var(--text-primary)]" placeholder="Enter current password" autoComplete="current-password" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--text-primary)]">New Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--input-bg)] text-[var(--text-primary)]" placeholder="Enter new password (min 8 chars)" autoComplete="new-password" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--text-primary)]">Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--input-bg)] text-[var(--text-primary)]" placeholder="Confirm new password" autoComplete="new-password" />
            </div>
            <Button
              onClick={handlePasswordChange}
              disabled={saving}
            >
              {saving ? 'Updating...' : 'Update Password'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Two-Factor Authentication</CardTitle>
            <CardDescription>
              Add an extra layer of security to your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--bg-secondary)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--accent-secondary)] flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-[var(--text-primary)]">Authenticator App</p>
                  <p className="text-sm text-[var(--text-muted)]">Use an app like Google Authenticator</p>
                </div>
              </div>
              <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-2.5 py-1 rounded-full">Coming Soon</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active Sessions</CardTitle>
            <CardDescription>
              Manage devices where you're logged in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--bg-secondary)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--accent-secondary)] flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="14" x="2" y="3" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-[var(--text-primary)]">Current Device</p>
                  <p className="text-sm text-[var(--text-muted)]">Active now</p>
                </div>
              </div>
              <span className="text-sm text-[var(--success)]">Active</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Login Alerts</CardTitle>
            <CardDescription>
              Get notified of new sign-ins to your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--text-muted)]">Email alerts are enabled by default.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}