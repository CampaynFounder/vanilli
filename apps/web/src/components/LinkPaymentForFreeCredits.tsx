'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

function LinkPaymentForFreeCreditsInner({ onSuccess: _onSuccess, updateOnly, offerFreeCredits }: { onSuccess: () => void; updateOnly?: boolean; offerFreeCredits?: boolean }) {
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'already_claimed' | 'ready' | 'success' | 'duplicate'>('idle');

  useEffect(() => {
    let mounted = true;
    (async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      if (!url || !session?.access_token) {
        if (mounted) {
          setError('Please sign in.');
          setLoading(false);
        }
        return;
      }
      const res = await fetch(`${url}/functions/v1/claim-free-credits-setup`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          ...(updateOnly ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(updateOnly ? { body: JSON.stringify({ updateOnly: true }) } : {}),
      });
      const j = await res.json().catch(() => ({}));
      if (!mounted) return;
      setLoading(false);
      if (!updateOnly && res.status === 400 && (j.error === 'Free credits already claimed' || j.error === 'Already claimed')) {
        setStatus('already_claimed');
        return;
      }
      if (res.ok && j.url) {
        setCheckoutUrl(j.url);
        setStatus('ready');
        return;
      }
      setError([j.error, j.details].filter(Boolean).join(' — ') || 'Could not start. Please try again.');
    })();
    return () => { mounted = false; };
  }, [updateOnly]);

  const goToCheckout = () => {
    if (checkoutUrl) window.location.href = checkoutUrl;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="spinner w-8 h-8" />
      </div>
    );
  }

  if (!updateOnly && status === 'already_claimed') {
    return (
      <p className="text-slate-400 text-sm">
        You&apos;ve already claimed your free credits.
      </p>
    );
  }

  if (!updateOnly && status === 'success') {
    return (
      <p className="text-green-400 text-sm font-medium">
        Your 3 free credits have been applied.
      </p>
    );
  }

  if (!updateOnly && status === 'duplicate') {
    return (
      <p className="text-amber-400 text-sm">
        This payment method was already used for free credits. Use a different payment method or buy credits.
      </p>
    );
  }

  if (status !== 'ready' || !checkoutUrl) {
    return <p className="text-slate-400 text-sm">{error || 'Unable to load.'}</p>;
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={goToCheckout}
        className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
      >
        {updateOnly ? 'Update payment method' : 'Link payment method to claim free credits'}
      </button>
      {!updateOnly && (
        <p className="text-xs text-slate-500">
          {offerFreeCredits ? 'No charge.' : 'No charge. Stripe Checkout will validate your payment method (card, Apple Pay, Google Pay, Cash App, etc.).'}
        </p>
      )}
    </div>
  );
}

export function LinkPaymentForFreeCredits({ onSuccess, updateOnly, offerFreeCredits }: { onSuccess: () => void; updateOnly?: boolean; offerFreeCredits?: boolean }) {
  return <LinkPaymentForFreeCreditsInner onSuccess={onSuccess} updateOnly={updateOnly} offerFreeCredits={offerFreeCredits} />;
}
