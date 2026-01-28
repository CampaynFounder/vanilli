'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const SIGNUP_CHANNEL = 'socialsignup';

function RefHandler() {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ref = searchParams?.get('ref');
    if (ref?.trim()) localStorage.setItem('vannilli_referral_code', ref.trim());
  }, [searchParams]);
  return null;
}

const HERO_HEADLINE_SRC = '/images/socialsignup/hero-headline.png';

const CAROUSEL_LOGO_SRCS = Array.from({ length: 7 }, (_, i) => ({
  id: `logo-${i + 1}`,
  src: `/images/socialsignup/logos/logo-${i + 1}.png`,
}));

function CarouselLogo({ src }: { src: string }) {
  const [err, setErr] = useState(false);
  return (
    <div
      className="flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl bg-transparent border border-white/10 flex items-center justify-center p-1.5 overflow-hidden"
      aria-hidden
    >
      {err ? (
        <span className="text-slate-600 text-[10px]">Logo</span>
      ) : (
        <img
          src={src}
          alt=""
          className="w-full h-full object-contain"
          loading="lazy"
          onError={() => setErr(true)}
        />
      )}
    </div>
  );
}

export default function SocialSignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [heroImgError, setHeroImgError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { signup_channel: SIGNUP_CHANNEL },
          emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/profile`,
        },
      });

      if (err) throw err;

      if (data.user) {
        setDone(true);
        if (data.session) {
          setMessage('Account created! Redirecting to claim your free credits…');
          setTimeout(() => {
            window.location.href = '/profile';
          }, 1500);
        } else {
          setMessage('Account created! Check your email to confirm, then you can claim free credits on your profile.');
        }
        setEmail('');
        setPassword('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Suspense fallback={null}>
        <RefHandler />
      </Suspense>
      <div
          className="min-h-screen bg-slate-950 text-white flex flex-col"
          style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
        >
        <div className="flex-1 w-full max-w-lg mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col">
          {/* Logo */}
          <div className="flex justify-center mb-6 sm:mb-8">
            <Link href="/" className="inline-flex">
              <Image
                src="/logo/logo.png"
                alt="Vannilli"
                width={160}
                height={54}
                className="h-12 w-auto object-contain sm:h-14"
                priority
              />
            </Link>
          </div>

          {/* Hero headline: PNG with gradual reveal, or text fallback */}
          <div className="text-center mb-6 sm:mb-8">
            <div className="min-h-[6rem] sm:min-h-[7rem] flex flex-col items-center justify-center mb-2 sm:mb-3">
              {heroImgError ? (
                <h1 className="text-2xl sm:text-3xl font-bold gradient-text-premium">
                  Get Your AI Artist Signed
                </h1>
              ) : (
                <div className="opacity-0 animate-reveal-hero w-full max-w-2xl mx-auto px-1">
                  <Image
                    src={HERO_HEADLINE_SRC}
                    alt="Get Your AI Artist Signed"
                    width={800}
                    height={200}
                    className="w-full h-auto object-contain"
                    priority
                    onError={() => setHeroImgError(true)}
                  />
                </div>
              )}
            </div>
            <h2 className="text-lg sm:text-xl text-slate-300 font-medium mb-4 sm:mb-6">
              Don&apos;t Miss the Next AI Music Industry Wave
            </h2>
          </div>

          {/* Logo carousel: transparent containers, auto-scrolling marquee */}
          <div className="mb-6 sm:mb-8">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 sm:mb-4 text-center">
              AI Artists Music Videos. That Get You Signed
            </h3>
            <div className="overflow-hidden -mx-4 sm:-mx-6" aria-hidden>
              <div className="flex gap-4 animate-marquee py-1">
                {[...CAROUSEL_LOGO_SRCS, ...CAROUSEL_LOGO_SRCS].map((item, i) => (
                  <CarouselLogo key={`${item.id}-${i}`} src={item.src} />
                ))}
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="flex-1 flex flex-col">
            <div className="rounded-2xl p-6 glass-card border border-white/10">
              {done ? (
                <div className="text-center py-4">
                  <p className="text-green-400 text-sm font-medium">{message}</p>
                  {!message.includes('Redirecting') && (
                    <Link
                      href="/profile"
                      className="inline-block mt-4 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
                    >
                      Go to Profile
                    </Link>
                  )}
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-white mb-1 text-center">Start Today For Free</h2>
                  <p className="text-slate-400 text-sm mb-5 text-center">Sign up to get started.</p>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="social-email" className="block text-sm font-medium text-slate-300 mb-1.5">
                        Email
                      </label>
                      <input
                        id="social-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        placeholder="you@example.com"
                        className="w-full px-4 py-3 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="social-password" className="block text-sm font-medium text-slate-300 mb-1.5">
                        Password
                      </label>
                      <input
                        id="social-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="••••••••"
                        className="w-full px-4 py-3 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                      <p className="mt-1 text-xs text-slate-500">At least 6 characters</p>
                    </div>
                    {error && (
                      <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                        {error}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold transition-all shadow-lg shadow-purple-500/30 animate-glow-pulse disabled:opacity-60 disabled:cursor-not-allowed disabled:animate-none active:scale-[0.99]"
                    >
                      {loading ? 'Securing…' : 'Secure my AI Artist Bag'}
                    </button>
                  </form>
                </>
              )}
            </div>

            <div className="mt-6 text-center">
              <p className="text-slate-400 text-sm">
                Already have an account?{' '}
                <Link href="/auth/signin" className="text-purple-400 hover:text-purple-300 font-semibold">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
