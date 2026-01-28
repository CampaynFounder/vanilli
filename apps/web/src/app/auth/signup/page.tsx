'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { GlassCard } from '@/components/ui/GlassCard';
import { getAuthBackgroundUrl } from '@/lib/auth-background';
import { isSignupsDisabledError, INSTAGRAM_LAUNCH_URL } from '@/lib/auth-errors';

function ReferralHandler() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ref = searchParams?.get('ref');
    if (ref && ref.trim()) {
      localStorage.setItem('vannilli_referral_code', ref.trim());
    }
  }, [searchParams]);

  return null;
}

function SignUpForm() {
  const bgUrl = getAuthBackgroundUrl();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [signupsDisabled, setSignupsDisabled] = useState(false);
  const [message, setMessage] = useState('');

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSignupsDisabled(false);
    setMessage('');

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // Validate password length
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/profile`,
        },
      });

      if (error) throw error;

      if (data.user) {
        setMessage('Account created! Check your email to confirm your account.');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An error occurred during sign up';
      if (isSignupsDisabledError(msg)) {
        setSignupsDisabled(true);
        setError('');
      } else {
        setSignupsDisabled(false);
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Suspense fallback={null}>
        <ReferralHandler />
      </Suspense>
      <div className="min-h-screen flex items-center justify-center px-4 relative">
        {/* Background image + overlay for legibility */}
        <div className="absolute inset-0 z-0">
          <div
            className="absolute inset-0 bg-slate-950"
            style={{
              backgroundImage: `url(${bgUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <div className="absolute inset-0 bg-slate-950/55" aria-hidden="true" />
        </div>
        <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Logo width={200} height={67} className="h-16 mb-2" />
          <p className="text-slate-400 mt-2">Create your account</p>
        </div>

        {/* Sign Up Form */}
        <GlassCard elevated>
          <h1 className="text-2xl font-bold text-white mb-6">Sign Up</h1>

          <form onSubmit={handleSignUp} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="you@example.com"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="••••••••"
              />
              <p className="mt-1 text-xs text-slate-400">Minimum 6 characters</p>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="••••••••"
              />
            </div>

            {/* Signups disabled: show launch CTA instead of generic error */}
            {signupsDisabled && (
              <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg text-slate-200 text-sm">
                Follow{' '}
                <a
                  href={INSTAGRAM_LAUNCH_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300 font-semibold underline underline-offset-2"
                >
                  @VANNILLI
                </a>{' '}
                for Official Feb 2026 Launch Date!
              </div>
            )}
            {/* Other auth errors */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Success Message */}
            {message && (
              <div className="p-3 bg-green-500/10 border border-green-500/50 rounded-lg text-green-400 text-sm">
                {message}
              </div>
            )}

            {/* Sign Up Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all tap-effect disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          {/* Links */}
          <div className="mt-6 text-center">
            <div className="text-sm text-slate-400">
              Already have an account?{' '}
              <Link href="/auth/signin" className="text-purple-400 hover:text-purple-300 font-semibold">
                Sign In
              </Link>
            </div>
          </div>
        </GlassCard>

        {/* Back to Home */}
        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-slate-400 hover:text-white transition-colors">
            ← Back to Home
          </Link>
        </div>
      </div>
      </div>
    </>
  );
}

export default function SignUpPage() {
  return <SignUpForm />;
}
