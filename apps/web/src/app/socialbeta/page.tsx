'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { PricingCards } from '@/components/PricingCards';
import { SocialBetaStripeStep } from '@/components/SocialBetaStripeStep';
import { SOCIALBETA_EVENTS } from '@/lib/gtag-socialbeta';
import { type Product } from '@/config/pricing';

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
      className="flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl bg-transparent flex items-center justify-center p-1.5 overflow-hidden"
      aria-hidden
    >
      {err ? (
        <span className="text-slate-600 text-[10px]">Logo</span>
      ) : (
        <img src={src} alt="" className="w-full h-full object-contain" loading="lazy" onError={() => setErr(true)} />
      )}
    </div>
  );
}

type Step = 'button' | 'stripe' | 'credentials' | 'success';

function SocialBetaContent() {
  const searchParams = useSearchParams();
  const [focusedPlan, setFocusedPlan] = useState<Product>('label');
  const [step, setStep] = useState<Step>('button');
  const [stripeError, setStripeError] = useState('');
  const [credEmail, setCredEmail] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [credLoading, setCredLoading] = useState(false);
  const [credError, setCredError] = useState('');
  const [heroImgError, setHeroImgError] = useState(false);
  const [finalEmail, setFinalEmail] = useState('');
  const [finalPassword, setFinalPassword] = useState('');

  const handleGetFreeCredits = async () => {
    SOCIALBETA_EVENTS.getFreeCreditsClick(focusedPlan);
    setStripeError('');
    setStep('stripe');
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      if (data.session) {
        SOCIALBETA_EVENTS.stripeStarted(focusedPlan);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not start. Please try again.';
      setStripeError(msg);
      setStep('button');
    }
  };

  const handleStripeSuccess = () => {
    SOCIALBETA_EVENTS.credentialsFormShown(focusedPlan);
    setStep('credentials');
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (credPassword.length < 6) {
      setCredError('Password must be at least 6 characters');
      return;
    }
    setCredLoading(true);
    setCredError('');
    try {
      const { error } = await supabase.auth.updateUser({ email: credEmail.trim(), password: credPassword });
      if (error) throw error;
      SOCIALBETA_EVENTS.credentialsCreated(focusedPlan);
      SOCIALBETA_EVENTS.complete(focusedPlan);
      setFinalEmail(credEmail.trim());
      setFinalPassword(credPassword);
      setStep('success');
    } catch (err) {
      setCredError(err instanceof Error ? err.message : 'Could not save credentials');
    } finally {
      setCredLoading(false);
    }
  };

  useEffect(() => {
    const setup = searchParams?.get('setup');
    if (setup !== 'success' || step !== 'button') return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setStep('credentials');
        SOCIALBETA_EVENTS.credentialsFormShown(focusedPlan);
      }
    });
  }, [searchParams, step, focusedPlan]);

  const handlePlanFocus = (plan: Product) => {
    setFocusedPlan(plan);
    SOCIALBETA_EVENTS.planSelected(plan);
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
          <div className="flex justify-center mb-6 sm:mb-8">
            <Link href="/" className="inline-flex">
              <Image src="/logo/logo.png" alt="Vannilli" width={160} height={54} className="h-12 sm:h-14 w-auto object-contain" priority />
            </Link>
          </div>

          <div className="text-center mb-6 sm:mb-8">
            <div className="min-h-[6rem] sm:min-h-[7rem] flex flex-col items-center justify-center mb-2 sm:mb-3">
              {heroImgError ? (
                <h1 className="text-2xl sm:text-3xl font-bold gradient-text-premium">Get Your AI Artist Signed</h1>
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
            <h2 className="text-lg sm:text-xl text-slate-300 font-medium mb-4 sm:mb-6">Don&apos;t Miss the Next AI Music Industry Wave</h2>
          </div>

          <div className="mb-6 sm:mb-8">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 sm:mb-4 text-center">
              Music Videos For AI Artists That Get YOU Signed
            </h3>
            <div className="overflow-hidden -mx-4 sm:-mx-6" aria-hidden>
              <div className="flex gap-[1.05rem] animate-marquee py-1">
                {[...CAROUSEL_LOGO_SRCS, ...CAROUSEL_LOGO_SRCS].map((item, i) => (
                  <CarouselLogo key={`${item.id}-${i}`} src={item.src} />
                ))}
              </div>
            </div>
          </div>

          <section className="mb-6 sm:mb-8 -mx-4 sm:-mx-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 sm:mb-4 text-center px-4">
              Plans That Work for Your AI Artist
            </h3>
            <PricingCards variant="landing" focusedPlan={focusedPlan} onCardFocus={handlePlanFocus} />
          </section>

          <div className="flex-1 flex flex-col">
            <div className="rounded-2xl p-6 glass-card border border-white/10">
              <AnimatePresence mode="wait">
                {step === 'button' && (
                  <motion.div
                    key="button"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-4"
                  >
                    <h2 className="text-xl font-bold text-white text-center">Get Free Credits</h2>
                    <p className="text-slate-400 text-sm text-center">Verify your payment method to claim 3 free credits. No charge.</p>
                    <button
                      type="button"
                      onClick={handleGetFreeCredits}
                      className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold transition-all shadow-lg shadow-purple-500/30 animate-glow-pulse"
                    >
                      Get Free Credits
                    </button>
                  </motion.div>
                )}

                {step === 'stripe' && (
                  <motion.div
                    key="stripe"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="space-y-4"
                  >
                    <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-2">
                      <p className="text-slate-200 text-sm font-medium">This is a verification step, not a payment.</p>
                      <p className="text-slate-400 text-xs">You can change or remove your payment method anytime in Profile after you log in. Secured by Stripe — not stored by VANNILLI.</p>
                    </div>
                    {stripeError && <p className="text-red-400 text-sm">{stripeError}</p>}
                    <SocialBetaStripeStep planId={focusedPlan} onSuccess={handleStripeSuccess} onError={setStripeError} />
                  </motion.div>
                )}

                {step === 'credentials' && (
                  <motion.form
                    key="credentials"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                    onSubmit={handleCredentialsSubmit}
                    className="space-y-4"
                  >
                    <h2 className="text-xl font-bold text-white text-center">Create Your Login</h2>
                    <p className="text-slate-400 text-sm text-center">Set your email and password so you can sign in anytime.</p>
                    <div>
                      <label htmlFor="sb-email" className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                      <input
                        id="sb-email"
                        type="email"
                        value={credEmail}
                        onChange={(e) => setCredEmail(e.target.value)}
                        required
                        autoComplete="email"
                        placeholder="you@example.com"
                        className="w-full px-4 py-3 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="sb-password" className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
                      <input
                        id="sb-password"
                        type="password"
                        value={credPassword}
                        onChange={(e) => setCredPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="••••••••"
                        className="w-full px-4 py-3 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <p className="mt-1 text-xs text-slate-500">At least 6 characters</p>
                    </div>
                    {credError && <p className="text-red-400 text-sm">{credError}</p>}
                    <button
                      type="submit"
                      disabled={credLoading}
                      className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-60 text-white font-semibold transition-all"
                    >
                      {credLoading ? 'Saving…' : 'Create Account'}
                    </button>
                  </motion.form>
                )}

                {step === 'success' && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-4 text-center"
                  >
                    <p className="text-green-400 font-medium">You have 3 credits!</p>
                    <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 text-left">
                      <p className="text-amber-200 text-sm font-medium mb-2">Screenshot your username/password in case you forget it.</p>
                      <p className="text-slate-300 text-sm">Email: {finalEmail}</p>
                      <p className="text-slate-300 text-sm mt-1">Password: {finalPassword}</p>
                    </div>
                    <Link
                      href="/studio"
                      className="block w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold transition-all text-center"
                    >
                      Go to Studio →
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="mt-6 text-center">
              <p className="text-slate-400 text-sm">
                Already have an account?{' '}
                <Link href="/auth/signin" className="text-purple-400 hover:text-purple-300 font-semibold">Sign in</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function SocialBetaPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="spinner w-10 h-10" />
      </div>
    }>
      <SocialBetaContent />
    </Suspense>
  );
}
