'use client';

import { useState, useMemo } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '@/lib/supabase';

const stripePk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

function LinkPaymentForm({
  clientSecret,
  onSuccess,
  onError,
  submitting,
  setSubmitting,
}: {
  clientSecret: string;
  onSuccess: () => void;
  onError: (s: string) => void;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    onError('');
    try {
      const returnUrl = typeof window !== 'undefined' ? `${window.location.origin}/profile` : '/profile';
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        clientSecret,
        confirmParams: { return_url: returnUrl },
        redirect: 'if_required',
      });
      if (error) {
        onError(error.message || 'Could not confirm');
        setSubmitting(false);
        return;
      }
      if (setupIntent?.status === 'succeeded' && setupIntent.id) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const { data: { session } } = await supabase.auth.getSession();
        if (!url || !session?.access_token) {
          onError('Session expired. Please sign in again.');
          setSubmitting(false);
          return;
        }
        const res = await fetch(`${url}/functions/v1/register-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ setup_intent_id: setupIntent.id }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          onError(j.error || 'Could not register payment method');
          setSubmitting(false);
          return;
        }
        onSuccess();
      } else {
        onError('Setup did not succeed');
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Something went wrong');
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
      >
        {submitting ? 'Saving…' : 'Save payment method'}
      </button>
    </form>
  );
}

export function LinkPaymentMethod({
  onSuccess,
  updateOnly,
}: {
  onSuccess: () => void;
  updateOnly?: boolean;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const stripePromise = useMemo(() => (stripePk ? loadStripe(stripePk) : null), []);

  const startSetup = async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();
    if (!url || !session?.access_token) {
      setError('Please sign in.');
      return;
    }
    if (!stripePk) {
      setError('Stripe is not configured.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${url}/functions/v1/create-setup-intent`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; clientSecret?: string };
      if (!res.ok) {
        setError(j.error || 'Could not start');
        setLoading(false);
        return;
      }
      if (j.clientSecret) {
        setClientSecret(j.clientSecret);
      } else {
        setError('No client secret');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
    setLoading(false);
  };

  const handleSuccess = () => {
    setSuccess(true);
    onSuccess();
  };

  if (success) {
    return (
      <p className="text-green-400 text-sm font-medium">
        Payment method linked.
      </p>
    );
  }

  if (clientSecret && stripePromise) {
    return (
      <div className="space-y-4">
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: 'night',
              variables: { borderRadius: '8px' },
            },
          }}
        >
          <LinkPaymentForm
            clientSecret={clientSecret}
            onSuccess={handleSuccess}
            onError={setError}
            submitting={submitting}
            setSubmitting={setSubmitting}
          />
        </Elements>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        type="button"
        onClick={startSetup}
        disabled={loading}
        className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-70 text-white font-semibold rounded-lg transition-colors"
      >
        {loading ? 'Loading…' : updateOnly ? 'Update payment method' : 'Link payment method to use the site'}
      </button>
      {!updateOnly && (
        <p className="text-xs text-slate-500">
          No charge. Card, Cash App, and other wallets supported. You&apos;ll receive 1 free credit when you link.
        </p>
      )}
    </div>
  );
}
