'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { sendOTP, verifyOTP, completeProfile } from '@/app/actions/otp-auth';
import { BRAND } from '@/lib/brand/config';
import { cn } from '@/lib/utils';

type AuthMode = 'login' | 'register';
type Step = 'email' | 'otp' | 'profile';

export function OTPAuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();

  // State
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Refs for OTP inputs
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Timer for resend
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  // Handle email submit
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await sendOTP(email);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Success - move to OTP step
    setStep('otp');
    setResendTimer(60); // 60 second cooldown
    setLoading(false);
    setSuccessMessage('Code sent! Check your email.');

    // Clear success message after 3 seconds
    setTimeout(() => setSuccessMessage(null), 3000);

    // Focus first OTP input
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  };

  // Handle OTP submit
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await verifyOTP(email, otpCode);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // If this is registration mode, ask for profile completion
    if (mode === 'register') {
      setStep('profile');
      setLoading(false);
    } else {
      // Login success - redirect
      router.push('/feed');
      router.refresh();
    }
  };

  // Handle profile completion
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!username || !displayName) {
      setError('Please fill in all fields');
      return;
    }

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      setError('Username must be 3-30 characters, lowercase letters, numbers, and underscores only');
      return;
    }

    setLoading(true);

    const result = await completeProfile(username, displayName);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Success - redirect to feed
    router.push('/feed');
    router.refresh();
  };

  // Resend OTP
  const handleResend = async () => {
    if (resendTimer > 0) return;

    setError(null);
    setLoading(true);

    const result = await sendOTP(email);

    if (result.error) {
      setError(result.error);
    } else {
      setResendTimer(60);
      setSuccessMessage('Code resent! Check your email.');
      setTimeout(() => setSuccessMessage(null), 3000);
    }

    setLoading(false);
  };

  // Handle OTP input change
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only numbers

    const newCode = otpCode.split('');
    newCode[index] = value.slice(-1); // Take only last digit
    setOtpCode(newCode.join(''));

    // Auto-advance to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when complete
    if (newCode.join('').length === 6) {
      // Submit form automatically after short delay
      setTimeout(() => {
        const form = document.getElementById('otp-form') as HTMLFormElement | null;
        if (form) form.dispatchEvent(new Event('submit', { bubbles: true }));
      }, 200);
    }
  };

  // Handle backspace
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Render email step
  if (step === 'email') {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--bg-primary)]">
        <header className="p-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors-fast">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
            </svg>
            Back
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-[380px]">
            {/* Logo */}
            <div className="flex items-center justify-center gap-2.5 mb-10">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] flex items-center justify-center">
                <span className="text-base font-semibold text-white">{BRAND.logo.symbol}</span>
              </div>
              <span className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">{BRAND.name}</span>
            </div>

            {/* Card */}
            <div className="rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-8">
              <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">
                {mode === 'login' ? 'Welcome back' : 'Create account'}
              </h1>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                {mode === 'login'
                  ? 'Enter your email to sign in'
                  : `Join ${BRAND.name} today`}
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-[var(--destructive)]/10 border border-[var(--destructive)]/20 text-sm text-[var(--destructive)]">
                  {error}
                </div>
              )}

              {successMessage && (
                <div className="mb-4 p-3 rounded-lg bg-[var(--success)]/10 border border-[var(--success)]/20 text-sm text-[var(--success)]">
                  {successMessage}
                </div>
              )}

              <form onSubmit={handleEmailSubmit} className="space-y-5">
                <div>
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Continue'}
                </button>
              </form>
            </div>

            <p className="text-center mt-6 text-sm text-[var(--text-muted)]">
              {mode === 'login' ? (
                <>
                  Don't have an account?{' '}
                  <Link href="/auth/register" className="text-[var(--accent-primary)] hover:underline">Sign up</Link>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <Link href="/auth/login" className="text-[var(--accent-primary)] hover:underline">Sign in</Link>
                </>
              )}
            </p>
          </div>
        </main>
      </div>
    );
  }

  // Render OTP step
  if (step === 'otp') {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--bg-primary)]">
        <header className="p-6">
          <button
            onClick={() => { setStep('email'); setError(null); }}
            className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors-fast"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
            </svg>
            Back
          </button>
        </header>

        <main className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-[380px]">
            {/* Logo */}
            <div className="flex items-center justify-center gap-2.5 mb-10">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] flex items-center justify-center">
                <span className="text-base font-semibold text-white">{BRAND.logo.symbol}</span>
              </div>
              <span className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">{BRAND.name}</span>
            </div>

            {/* Card */}
            <div className="rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-8">
              <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">Check your email</h1>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                We sent a 6-digit code to<br />
                <span className="text-[var(--text-primary)] font-medium">{email}</span>
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-[var(--destructive)]/10 border border-[var(--destructive)]/20 text-sm text-[var(--destructive)]">
                  {error}
                </div>
              )}

              {successMessage && (
                <div className="mb-4 p-3 rounded-lg bg-[var(--success)]/10 border border-[var(--success)]/20 text-sm text-[var(--success)]">
                  {successMessage}
                </div>
              )}

              <form id="otp-form" onSubmit={handleOtpSubmit} className="space-y-6">
                {/* OTP Inputs */}
                <div className="flex justify-center gap-2">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={otpCode[i] || ''}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      className="w-12 h-14 text-center text-xl font-bold rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)]"
                    />
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={loading || otpCode.length !== 6}
                  className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Verify'}
                </button>
              </form>

              {/* Resend */}
              <div className="mt-6 text-center">
                {resendTimer > 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    Resend in {resendTimer}s
                  </p>
                ) : (
                  <button
                    onClick={handleResend}
                    disabled={loading}
                    className="text-sm text-[var(--accent-primary)] hover:underline disabled:opacity-50"
                  >
                    Didn't receive code? Resend
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Render profile completion step (registration only)
  if (step === 'profile') {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--bg-primary)]">
        <header className="p-6">
          {/* Can't go back from profile step */}
        </header>

        <main className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-[380px]">
            {/* Logo */}
            <div className="flex items-center justify-center gap-2.5 mb-10">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] flex items-center justify-center">
                <span className="text-base font-semibold text-white">{BRAND.logo.symbol}</span>
              </div>
              <span className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">{BRAND.name}</span>
            </div>

            {/* Card */}
            <div className="rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-8">
              <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">Complete your profile</h1>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                Set up your username and display name
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-[var(--destructive)]/10 border border-[var(--destructive)]/20 text-sm text-[var(--destructive)]">
                  {error}
                </div>
              )}

              <form onSubmit={handleProfileSubmit} className="space-y-5">
                <div>
                  <input
                    type="text"
                    placeholder="Display Name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <input
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    required
                    pattern="^[a-z0-9_]{3,30}$"
                    title="3-30 characters, lowercase letters, numbers, and underscores only"
                    className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)]"
                  />
                  <p className="text-xs text-[var(--text-muted)] mt-2">This will be your unique URL: /profile/{username || 'username'}</p>
                </div>

                <button
                  type="submit"
                  disabled={loading || !username || !displayName}
                  className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? 'Setting up...' : 'Complete Profile'}
                </button>
              </form>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return null;
}