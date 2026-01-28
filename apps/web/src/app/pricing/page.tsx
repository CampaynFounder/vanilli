'use client';

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, type Transition } from 'framer-motion';
import { loadStripe } from '@stripe/stripe-js';
import { useAuth } from '@/lib/auth';
import { Logo } from '@/components/Logo';
import { AppBackground } from '@/components/AppBackground';

type Product = 'open_mic' | 'artist' | 'label' | 'industry' | 'demo';

const PLANS: Array<{
  id: Product;
  name: string;
  price: number;
  period: string;
  credits: number;
  description: string;
  cta: string;
  featured: boolean;
  features: string[];
}> = [
  {
    id: 'open_mic',
    name: 'Open Mic',
    price: 15,
    period: 'one-time',
    credits: 40,
    description: 'One-time credits to try pro lip-sync.',
    cta: 'Re-Up On Credits',
    featured: false,
    features: ['3–9 second videos', '1 credit = 1 second', '40 one-time credits', 'Watermarked downloads', 'Lip-sync + audio'],
  },
  {
    id: 'artist',
    name: 'Artist',
    price: 20,
    period: '/mo',
    credits: 80,
    description: 'Steady output for growing artists.',
    cta: 'Re-Up On Credits',
    featured: false,
    features: ['3–9 second videos', '1 credit = 1 second', '80 credits per month', 'Watermarked downloads', 'Lip-sync + audio'],
  },
  {
    id: 'label',
    name: 'Label',
    price: 50,
    period: '/mo',
    credits: 330,
    description: 'High volume for labels and serious creators.',
    cta: 'Re-Up On Credits',
    featured: true,
    features: ['3–9 second videos', '1 credit = 1 second', '330 credits per month', 'Watermarked downloads', 'Lip-sync + audio', 'High volume for serious creators'],
  },
  {
    id: 'industry',
    name: 'Industry',
    price: 199,
    period: '/mo',
    credits: 1000,
    description: 'Professional tier for AI artist label deals.',
    cta: 'Re-Up On Credits',
    featured: false,
    features: ['Up to 90 second videos', '1 credit = 1 second', '1000 credits per month', 'Auto-segmentation', 'No watermarks', 'Priority processing'],
  },
  {
    id: 'demo',
    name: 'DEMO',
    price: 0,
    period: '/day',
    credits: 20,
    description: 'Investor demo tier - 20 credits per day (no rollover).',
    cta: 'Enroll',
    featured: false,
    features: ['Up to 20 second videos', '1 credit = 1 second', '20 credits per day', 'Tempo-based scene calculation', 'Multi-image support', 'No watermarks'],
  },
];

const cardSpring: Transition = { type: 'spring', stiffness: 380, damping: 28 };
const tapSpring: Transition = { type: 'spring', stiffness: 500, damping: 35 };

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5 text-purple-400'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

const getSuccessUrl = (product: Product) => `/checkout-success?product=${product}`;

export default function PricingPage() {
  const router = useRouter();
  const { user, loading: authLoading, session, signOut } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const planRefs = useRef<Record<Product, HTMLDivElement | null>>({ open_mic: null, artist: null, label: null, industry: null, demo: null });
  const [focusedPlan, setFocusedPlan] = useState<Product>('label');
  const [purchasingProduct, setPurchasingProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (authLoading) return;
    const t = setTimeout(() => {
      planRefs.current[focusedPlan]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
    }, 100);
    return () => clearTimeout(t);
  }, [authLoading, focusedPlan]);

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

      {/* Pricing cards – horizontal scroll on mobile, grid on desktop */}
      <section className="px-4 sm:px-6 lg:px-8 pt-8 pb-10">
        {user && user.hasValidCard !== true && (
          <div className="max-w-6xl mx-auto mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center">
            <p className="text-amber-200 text-sm">
              Link a payment method in your <Link href="/profile?link_required=1" className="underline font-medium">Profile</Link> to purchase credits.
            </p>
          </div>
        )}
        <div
          ref={scrollRef}
          className="max-w-6xl mx-auto flex sm:grid sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6 overflow-x-auto overflow-y-visible pt-6 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory sm:overflow-visible video-gallery-scroll"
        >
          {PLANS.map((p) => {
            const isFocused = focusedPlan === p.id;
            return (
              <motion.div
                key={p.id}
                ref={(el) => { planRefs.current[p.id] = el; }}
                role="button"
                tabIndex={0}
                onClick={() => setFocusedPlan(p.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFocusedPlan(p.id); } }}
                animate={{
                  scale: isFocused ? 1.02 : 1,
                  y: isFocused ? -4 : 0,
                  boxShadow: isFocused
                    ? '0 20px 40px -12px rgba(168, 85, 247, 0.35), 0 0 0 2px rgba(192, 132, 252, 0.5)'
                    : '0 0 0 0 rgba(0,0,0,0)',
                }}
                transition={cardSpring}
                whileHover={!isFocused ? { scale: 1.02, y: -2 } : undefined}
                whileTap={{ scale: 0.98, transition: tapSpring }}
                className={`
                  flex-shrink-0 w-[300px] sm:w-auto snap-center rounded-2xl p-6 sm:p-7 flex flex-col cursor-pointer
                  ${isFocused
                    ? 'bg-gradient-to-br from-purple-600 to-violet-700 border-0'
                    : 'bg-slate-900/80 border border-slate-700/80 hover:border-slate-600'
                  }
                `}
              >
                {p.featured && (
                  <span className="inline-block text-[10px] font-semibold text-purple-200 uppercase tracking-wider mb-3">
                    Most popular
                  </span>
                )}
                <h3 className="text-xl font-bold text-white">{p.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white">${p.price}</span>
                  <span className={isFocused ? 'text-purple-200 text-sm' : 'text-slate-400 text-sm'}>{p.period}</span>
                </div>
                <p className={isFocused ? 'text-purple-100 text-sm mt-2' : 'text-slate-400 text-sm mt-2'}>{p.description}</p>
                <p className={isFocused ? 'text-purple-200/90 text-xs mt-1' : 'text-slate-500 text-xs mt-1'}>{p.credits} credits</p>
                <div className="mt-6 flex-1" />
                <button
                  onClick={(e) => { e.stopPropagation(); handleSelect(p.id); }}
                  disabled={!!purchasingProduct || (!!user && user.hasValidCard !== true)}
                  className={`
                    w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed
                    ${isFocused
                      ? 'bg-white text-purple-600 hover:bg-white/95'
                      : 'bg-slate-800 border border-slate-600 text-white hover:bg-slate-700 hover:border-slate-500'
                    }
                  `}
                >
                  {purchasingProduct === p.id ? 'Processing…' : user ? p.cta : 'Sign in to buy'}
                </button>
              </motion.div>
            );
          })}
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
