'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ButtonSpinner } from '@/components/ui/loader';
import { PageSkeleton } from '@/components/design-system/skeleton';
import { sendPasswordReset, verifyRecoveryToken, setPassword } from '@/services/auth';
import { BRAND } from '@/lib/brand/config';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <PageSkeleton />
    </div>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();

  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const isRecovery = tokenHash && type === 'recovery';

  return isRecovery ? (
    <SetNewPassword tokenHash={tokenHash} />
  ) : (
    <RequestReset />
  );
}

function SetNewPassword({ tokenHash }: { tokenHash: string }) {
  const router = useRouter();
  const [password, setPasswordValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(true);
  const submittingRef = useRef(false);

  useEffect(() => {
    const verify = async () => {
      const result = await verifyRecoveryToken(tokenHash);
      if (result.error) {
        setError(result.error);
      }
      setVerifying(false);
    };
    verify();
  }, [tokenHash]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must contain at least one letter and one number');
      return;
    }
    if (submittingRef.current || loading) return;
    submittingRef.current = true;
    setLoading(true);

    try {
      const result = await setPassword(password);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push('/auth/login');
    } catch {
      setError('Could not connect. Check your internet and try again.');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <PageSkeleton />
      </div>
    );
  }

  if (error && !password) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--bg-primary)]">
        <header className="p-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <Link href="/auth/login" aria-label="Back to login" className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors-fast">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
            Back
          </Link>
        </header>
        <main className="flex-1 flex items-center justify-center px-5 py-8">
          <div className="w-full max-w-[380px]">
            <div className="rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-6 text-center">
              <p className="text-sm text-[var(--destructive)] mb-4">{error}</p>
              <Link href="/auth/reset-password" className="block w-full py-3 rounded-xl bg-[var(--accent-primary)] text-[var(--text-inverse)] text-sm font-semibold hover:opacity-90 transition-opacity">Request new link</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-primary)]">
      <header className="p-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <Link href="/auth/login" aria-label="Back to login" className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors-fast">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
          Back
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-[380px]">
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] flex items-center justify-center">
              <span className="text-base font-semibold text-white">{BRAND.logo.symbol}</span>
            </div>
            <span className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">{BRAND.name}</span>
          </div>
          <div className="rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-6">
            <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">Set new password</h1>
            <p className="text-sm text-[var(--text-muted)] mb-6">Choose a strong password for your account</p>
            {error && <div role="alert" aria-live="polite" className="mb-4 p-3 rounded-lg bg-[var(--destructive)]/10 border border-[var(--destructive)]/20 text-sm text-[var(--destructive)]">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="relative">
                <label htmlFor="new-password" className="sr-only">New password</label>
                <input id="new-password" type={showPassword ? 'text' : 'password'} placeholder="New password (min 8 chars, 1 letter, 1 number)" value={password} onChange={(e) => setPasswordValue(e.target.value)} required autoComplete="new-password" className="w-full px-4 py-3 pr-12 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] text-[var(--text-primary)]" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
              <div>
                <label htmlFor="confirm-password" className="sr-only">Confirm password</label>
                <input id="confirm-password" type={showPassword ? 'text' : 'password'} placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] text-[var(--text-primary)]" />
              </div>
              <button type="submit" disabled={loading || !password || !confirmPassword} className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-[var(--text-inverse)] text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">{loading ? 'Saving...' : 'Save password'}</button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

function RequestReset() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const submittingRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (submittingRef.current || loading) return;
    submittingRef.current = true;
    setLoading(true);

    try {
      const result = await sendPasswordReset(email);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSent(true);
    } catch {
      setError('Could not connect. Check your internet and try again.');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-primary)]">
      <header className="p-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <Link href="/auth/login" aria-label="Back to login" className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors-fast">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
          Back
        </Link>
      </header>

      <main id="main-content" className="flex-1 flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-[380px]">
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] flex items-center justify-center">
              <span className="text-base font-semibold text-white">{BRAND.logo.symbol}</span>
            </div>
            <span className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">{BRAND.name}</span>
          </div>

          <div className="rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-6">
            {sent ? (
              <>
                <div className="text-center mb-6">
                  <div className="w-12 h-12 rounded-full bg-[var(--success)]/10 flex items-center justify-center mx-auto mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--success)]"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9z"/></svg>
                  </div>
                  <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">Check your email</h1>
                  <p className="text-sm text-[var(--text-muted)]">We sent a password reset link to<br /><span className="text-[var(--text-primary)] font-medium">{email}</span></p>
                </div>
                <Link href="/auth/login" className="block w-full py-3 text-center rounded-xl bg-[var(--accent-primary)] text-[var(--text-inverse)] text-sm font-semibold hover:opacity-90 transition-opacity">Back to login</Link>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">Reset password</h1>
                <p className="text-sm text-[var(--text-muted)] mb-6">Enter your email and we&apos;ll send you a reset link</p>
                {error && <div role="alert" aria-live="polite" className="mb-4 p-3 rounded-lg bg-[var(--destructive)]/10 border border-[var(--destructive)]/20 text-sm text-[var(--destructive)]">{error}</div>}
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="email-input" className="sr-only">Email address</label>
                    <input id="email-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] text-[var(--text-primary)]" />
                  </div>
                  <button type="submit" disabled={loading || !email} className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-[var(--text-inverse)] text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">{loading ? 'Sending...' : 'Send reset link'}</button>
                </form>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
