'use client';

import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '@/lib/supabase';

const pk = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '') : '';
const stripePromise = pk ? loadStripe(pk) : null;

function LinkPaymentForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'already_claimed' | 'form' | 'success' | 'duplicate'>('idle');

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
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const j = await res.json().catch(() => ({}));
      if (!mounted) return;
      setLoading(false);
      if (res.status === 400 && (j.error === 'Free credits already claimed' || j.error === 'Already claimed')) {
        setStatus('already_claimed');
        return;
      }
      if (res.ok && j.clientSecret) {
        setClientSecret(j.clientSecret);
        setStatus('form');
        return;
      }
      setError(j.error || 'Could not start. Please try again.');
    })();
    return () => { mounted = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !clientSecret) return;
    const cardEl = elements.getElement(CardElement);
    if (!cardEl) {
      setError('Card field not ready.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: confirmErr } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: cardEl },
    });
    if (confirmErr) {
      setError(confirmErr.message || 'Payment failed.');
      setSubmitting(false);
      return;
    }
    // Webhook grants credits async. Poll user for a short time.
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      onSuccess();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) continue;
      const { data: row } = await supabase.from('users').select('free_generation_redeemed, credits_remaining').eq('id', user.id).single();
      if (row?.free_generation_redeemed || (row?.credits_remaining ?? 0) > 0) {
        setStatus('success');
        setSubmitting(false);
        return;
      }
    }
    // Might be duplicate card (webhook rejected)
    setStatus('duplicate');
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="spinner w-8 h-8" />
      </div>
    );
  }

  if (status === 'already_claimed') {
    return (
      <p className="text-slate-400 text-sm">
        You&apos;ve already claimed your free credits.
      </p>
    );
  }

  if (status === 'success') {
    return (
      <p className="text-green-400 text-sm font-medium">
        Your 3 free credits have been applied.
      </p>
    );
  }

  if (status === 'duplicate') {
    return (
      <p className="text-amber-400 text-sm">
        This payment method was already used for free credits. Use a different card or buy credits.
      </p>
    );
  }

  if (status !== 'form' || !clientSecret) {
    return <p className="text-slate-400 text-sm">{error || 'Unable to load form.'}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
        <CardElement
          options={{
            style: {
              base: { fontSize: '16px', color: '#e2e8f0', '::placeholder': { color: '#94a3b8' } },
              invalid: { color: '#f87171' },
            },
          }}
        />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
      >
        {submitting ? 'Processing…' : 'Link card & get 3 free credits'}
      </button>
      <p className="text-xs text-slate-500">No charge. Your card is only used to verify identity. One free-credit grant per payment method.</p>
    </form>
  );
}

export function LinkPaymentForFreeCredits({ onSuccess }: { onSuccess: () => void }) {
  if (!pk) {
    return (
      <p className="text-slate-500 text-sm">Add <code className="bg-slate-800 px-1 rounded">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> to enable free credits.</p>
    );
  }
  if (!stripePromise) {
    return <p className="text-slate-500 text-sm">Loading…</p>;
  }
  return (
    <Elements stripe={stripePromise}>
      <LinkPaymentForm onSuccess={onSuccess} />
    </Elements>
  );
}
