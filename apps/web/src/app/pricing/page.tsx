'use client';

import { useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Logo } from '@/components/Logo';
import { GlassCard } from '@/components/ui/GlassCard';

type Product = 'open_mic' | 'artist' | 'label';

const PLANS = [
  { id: 'open_mic' as Product, name: 'Open Mic', price: 15, period: 'one-time', credits: 40, cta: 'Get Open Mic', featured: false },
  { id: 'artist' as Product, name: 'Artist', price: 20, period: '/mo', credits: 80, cta: 'Get Artist', featured: false },
  { id: 'label' as Product, name: 'Label', price: 50, period: '/mo', credits: 330, cta: 'Get Label', featured: true },
];

export default function PricingPage() {
  const { user, loading: authLoading, session } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const labelCardRef = useRef<HTMLDivElement | null>(null);

  // Default scroll to Label ($50) on mount
  useEffect(() => {
    if (authLoading || !scrollRef.current) return;
    const t = setTimeout(() => {
      labelCardRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
    }, 100);
    return () => clearTimeout(t);
  }, [authLoading]);

  const handleSelect = async (product: Product) => {
    if (!user || !session?.access_token) {
      window.location.href = `/auth/signin?redirect=${encodeURIComponent('/pricing')}`;
      return;
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
      console.error('NEXT_PUBLIC_SUPABASE_URL not set');
      return;
    }
    try {
      const res = await fetch(`${url}/functions/v1/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ product }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.url) {
        window.location.href = j.url;
      } else {
        console.error(j.error || 'Checkout failed');
        alert(j.error || 'Could not start checkout. Try again.');
      }
    } catch (e) {
      console.error(e);
      alert('Could not start checkout. Try again.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/90 border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center">
              <Logo width={110} height={36} className="h-9" />
            </Link>
            <div className="flex items-center gap-3">
              {user ? (
                <Link href="/studio" className="px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white transition-colors">
                  Studio
                </Link>
              ) : (
                <Link href="/auth/signin" className="px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white transition-colors">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Plans & credits</h1>
          <p className="text-slate-400 text-sm sm:text-base">1 credit = 1 second of video. You need at least 9 credits to create (3–9s clips).</p>
        </div>

        {/* Horizontal scroll - mobile first */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory scroll-smooth video-gallery-scroll"
          style={{ scrollbarGutter: 'stable' }}
        >
          {PLANS.map((p) => (
            <div
              key={p.id}
              ref={p.id === 'label' ? labelCardRef : null}
              className="flex-shrink-0 w-[280px] sm:w-[300px] snap-center"
            >
              <GlassCard elevated className={`h-full flex flex-col ${p.featured ? 'ring-2 ring-purple-500/60' : ''}`}>
                {p.featured && (
                  <div className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-2">Most popular</div>
                )}
                <h3 className="text-lg font-semibold text-white">{p.name}</h3>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-white">${p.price}</span>
                  <span className="text-slate-400 text-sm">{p.period}</span>
                </div>
                <p className="text-slate-400 text-sm mt-2">{p.credits} credits</p>
                <div className="mt-4 flex-1" />
                <button
                  onClick={() => handleSelect(p.id)}
                  className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all ${
                    p.featured
                      ? 'bg-purple-600 hover:bg-purple-700 text-white'
                      : 'bg-slate-700/80 hover:bg-slate-600 text-slate-200'
                  }`}
                >
                  {user ? p.cta : 'Sign in to buy'}
                </button>
              </GlassCard>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-500 mt-4 text-center">Scroll to see all options. Subscriptions renew monthly. One-time purchases do not auto-renew.</p>

        {!user && (
          <div className="mt-8">
            <GlassCard className="text-center py-6">
              <p className="text-slate-300 text-sm">Create an account to buy credits or subscribe. New users can link a card for 3 free credits.</p>
              <Link href="/auth/signup" className="inline-block mt-3 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg text-sm">
                Sign up
              </Link>
            </GlassCard>
          </div>
        )}
      </div>
    </div>
  );
}
