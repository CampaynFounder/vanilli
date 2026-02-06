'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { loadStripe } from '@stripe/stripe-js';
import { useAuth } from '@/lib/auth';
import { Logo } from '@/components/Logo';
import { AppBackground } from '@/components/AppBackground';
import { PricingCards } from '@/components/PricingCards';
import { PLANS, type Product, resolvePricingPlan, getStoredPricingPlan, setStoredPricingPlan } from '@/config/pricing';
import { canUseDemoTier } from '@/config/demo-beta';

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5 text-purple-400'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

const getSuccessUrl = (product: Product) => `/checkout-success?product=${product}`;

function getInitialPlan(searchParams: ReturnType<typeof useSearchParams>): Product {
  const fromUrl = searchParams?.get('plan');
  if (fromUrl) return resolvePricingPlan(fromUrl);
  const stored = getStoredPricingPlan();
  if (stored) return stored;
  return 'label';
}

function PricingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, session, signOut } = useAuth();
  const [focusedPlan, setFocusedPlan] = useState<Product>('label');
  const [purchasingProduct, setPurchasingProduct] = useState<Product | null>(null);

  // Set initial plan from URL or storage (client-only)
  useEffect(() => {
    setFocusedPlan(getInitialPlan(searchParams));
  }, [searchParams]);

  const handleCardFocus = useCallback(
    (plan: Product) => {
      setFocusedPlan(plan);
      setStoredPricingPlan(plan);
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('plan', plan);
        window.history.replaceState(null, '', url.toString());
      }
    },
    []
  );

  // Reset focused plan when demo is hidden (logged out)
  useEffect(() => {
    if (!user && focusedPlan === 'demo') setFocusedPlan('label');
  }, [user, focusedPlan]);

  const fallbackToCheckout = async (product: Product) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url || !session?.access_token) return;
    const res = await fetch(`${url}/functions/v1/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ product }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.url) {
      window.location.href = j.url;
    } else {
      setPurchasingProduct(null);
      alert(j.error || 'Could not start checkout. Try again.');
    }
  };

  const handleSelect = async (product: Product) => {
    if (!user || !session?.access_token) {
      router.push('/auth/signin?redirect=' + encodeURIComponent('/pricing'));
      return;
    }
    if (user.hasValidCard !== true) {
      router.push('/profile?link_required=1');
      return;
    }
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!baseUrl) {
      console.error('NEXT_PUBLIC_SUPABASE_URL not set');
      return;
    }
    setPurchasingProduct(product);
    try {
      const res = await fetch(`${baseUrl}/functions/v1/one-tap-purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ product }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        requires_action?: boolean;
        client_secret?: string;
        error?: string;
        fallback?: boolean;
      };

      if (j.success) {
        window.location.href = getSuccessUrl(product);
        return;
      }

      if (j.requires_action && j.client_secret) {
        const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        if (!pk) {
          await fallbackToCheckout(product);
          return;
        }
        const stripe = await loadStripe(pk);
        if (!stripe) {
          await fallbackToCheckout(product);
          return;
        }
        const { error } = await stripe.confirmCardPayment(j.client_secret);
        if (error) {
          setPurchasingProduct(null);
          alert(error.message || 'Payment could not be confirmed. Try again.');
          return;
        }
        window.location.href = getSuccessUrl(product);
        return;
      }

      await fallbackToCheckout(product);
    } catch (e) {
      console.error(e);
      setPurchasingProduct(null);
      alert('Could not start checkout. Try again.');
    }
  };

  return (
    <div className="min-h-screen relative">
      <AppBackground />
      <div className="relative z-10">
      {/* Header */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/95 border-b border-slate-800/50 h-12 sm:h-14 md:h-16 overflow-x-hidden">
        <div className="w-full mx-auto px-1 sm:px-2 md:px-4 lg:px-6 h-full overflow-x-hidden">
          <div className="flex items-center justify-between h-full gap-0 sm:gap-0.5 md:gap-1 min-w-0">
            <Logo width={120} height={40} className="h-6 sm:h-8 md:h-11 lg:h-14 w-auto object-contain" href={user ? '/profile' : '/'} />
            <div className="flex items-center gap-0 sm:gap-0.5 md:gap-1 lg:gap-1.5 flex-shrink-0 min-w-0">
              {!user && (
                <Link href="/#features" className="hidden sm:block text-[9px] md:text-xs lg:text-sm text-slate-400 hover:text-white transition-colors">
                  How it works
                </Link>
              )}
              <Link href="/pricing" className="hidden sm:flex items-center opacity-100 transition-opacity flex-shrink-0" aria-label="Pricing">
                <img src="/icons/nav/pricing.png" alt="" className="h-5 sm:h-7 md:h-9 lg:h-12 w-auto object-contain" />
              </Link>
              {user ? (
                <>
                  <Link href="/studio" className="flex items-center opacity-60 hover:opacity-100 transition-opacity flex-shrink-0" aria-label="Studio">
                    <img src="/icons/nav/studio.png" alt="" className="h-5 sm:h-7 md:h-9 lg:h-12 w-auto object-contain" />
                  </Link>
                  <button
                    onClick={async () => { await signOut(); router.push('/'); }}
                    className="flex items-center gap-0 sm:gap-0.5 md:gap-1 lg:gap-1.5 px-0.5 sm:px-1 md:px-1.5 lg:px-2 py-0.5 sm:py-1 md:py-1.5 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded sm:rounded-md md:rounded-lg transition-colors flex-shrink-0"
                    aria-label="Sign out"
                  >
                    <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span className="hidden sm:inline text-[9px] md:text-xs lg:text-sm">Sign out</span>
                  </button>
                </>
              ) : (
                <>
                  <Link href="/auth/signin" className="text-sm text-slate-400 hover:text-white transition-colors">
                    Sign in
                  </Link>
                  <Link
                    href="/auth/signup"
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white transition-all"
                  >
                    Get started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-12 sm:pt-16 pb-10 sm:pb-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight">
            Create More Videos. Secure Your AI Label Deal.
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto">
            More Labels are looking for Hyper Real AI Artists. Don't miss this opportunity to build a roster and get a Major Label Bag.
          </p>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="px-4 sm:px-6 lg:px-8 pt-8 pb-10">
        {user && user.hasValidCard !== true && (
          <div className="max-w-6xl mx-auto mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center">
            <p className="text-amber-200 text-sm">
              Link a payment method in your <Link href="/profile?link_required=1" className="underline font-medium">Profile</Link> to purchase credits.
            </p>
          </div>
        )}
        <div className="max-w-6xl mx-auto pt-6">
          <PricingCards
            variant="app"
            plans={PLANS}
            focusedPlan={focusedPlan}
            onCardFocus={handleCardFocus}
            onSelect={handleSelect}
            purchasingProduct={purchasingProduct}
            user={user}
            scrollOnMobile
            showDemoTier={!!user && canUseDemoTier(user.email)}
          />
        </div>
        <p className="max-w-6xl mx-auto mt-4 text-center text-xs text-slate-500">
          Subscriptions renew monthly. One-time does not auto-renew.
        </p>
      </section>

      {/* Feature comparison – updates with focused plan */}
      <section className="px-4 sm:px-6 lg:px-8 pb-14">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider text-center mb-6">
            What’s included with <span className="text-white">{PLANS.find((pl) => pl.id === focusedPlan)?.name ?? focusedPlan}</span>
          </h2>
          <motion.div
            key={focusedPlan}
            initial={{ opacity: 0.7, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 sm:p-8"
          >
            <motion.ul
              className="space-y-4"
              initial="hidden"
              animate="visible"
              variants={{
                visible: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
                hidden: {},
              }}
            >
              {(PLANS.find((pl) => pl.id === focusedPlan)?.features ?? []).map((label) => (
                <motion.li
                  key={label}
                  variants={{ hidden: { opacity: 0, x: -6 }, visible: { opacity: 1, x: 0 } }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-3 text-slate-300"
                >
                  <CheckIcon />
                  <span>{label}</span>
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
        </div>
      </section>

      {/* CTA for signed-out */}
      {!user && (
        <section className="px-4 sm:px-6 lg:px-8 pb-16">
          <div className="max-w-2xl mx-auto text-center rounded-2xl bg-slate-900/60 border border-slate-800 py-10 px-6">
            <p className="text-slate-300 text-base mb-4">
              Create an account to buy credits or subscribe. New users can link a payment method for <strong className="text-white">3 free credits</strong>.
            </p>
            <Link
              href="/auth/signup"
              className="inline-block px-6 py-3 rounded-xl font-semibold bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white transition-all"
            >
              Sign up
            </Link>
          </div>
        </section>
      )}
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen relative">
        <AppBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <div className="spinner w-12 h-12" />
        </div>
      </div>
    }>
      <PricingPageContent />
    </Suspense>
  );
}
