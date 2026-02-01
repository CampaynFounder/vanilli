'use client';

import { useState, useEffect, useMemo } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '@/lib/supabase';
import { SOCIALBETA_EVENTS } from '@/lib/gtag-socialbeta';
import type { Product } from '@/config/pricing';

const stripePk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

function StripeForm({
  clientSecret,
  planId,
  onSuccess,
  onError,
  submitting,
  setSubmitting,
}: {
  clientSecret: string;
  planId: Product;
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
      const { error: submitError } = await elements.submit();
      if (submitError) {
        onError(submitError.message || 'Please complete the form');
        setSubmitting(false);
        return;
      }
      const returnUrl = typeof window !== 'undefined' ? `${window.location.origin}/socialbeta?setup=success` : '/socialbeta?setup=success';
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        clientSecret,
        confirmParams: { return_url: returnUrl },
        redirect: 'if_required',
      });

      if (!setupIntent && !error) return;

      if (error) {
        onError(error.message || 'Could not confirm');
        setSubmitting(false);
        return;
      }

      if (setupIntent?.status === 'succeeded' && setupIntent.id) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const { data: { session } } = await supabase.auth.getSession();
        if (!url || !session?.access_token) {
          onError('Session expired. Please try again.');
          setSubmitting(false);
          return;
        }
        const res = await fetch(`${url}/functions/v1/register-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ setup_intent_id: setupIntent.id }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string; payment_method_already_used?: boolean };
        if (!res.ok) {
          onError(j.error || 'Could not register payment method');
          setSubmitting(false);
          return;
        }
        if (j.payment_method_already_used) {
          onError('This payment method was already used. Please use a different card.');
          setSubmitting(false);
          return;
        }
        SOCIALBETA_EVENTS.cardLinked(planId);
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
      <PaymentElement options={{ layout: 'tabs', paymentMethodOrder: ['card', 'link'] }} />
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold transition-all"
      >
        {submitting ? 'Verifying…' : 'Verify Payment Method (No Charge)'}
      </button>
    </form>
  );
}

export function SocialBetaStripeStep({
  planId,
  onSuccess,
  onError,
}: {
  planId: Product;
  onSuccess: () => void;
  onError: (s: string) => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      if (!url || !session?.access_token || !stripePk) {
        onError('Session expired. Please refresh and try again.');
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`${url}/functions/v1/create-setup-intent`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string; clientSecret?: string };
        if (!mounted) return;
        if (!res.ok) {
          onError(j.error || 'Could not start');
          return;
        }
        if (j.clientSecret) setClientSecret(j.clientSecret);
        else onError('Could not load form');
      } catch (e) {
        if (mounted) onError(e instanceof Error ? e.message : 'Something went wrong');
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [onError]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="spinner w-10 h-10" />
      </div>
    );
  }

  if (!clientSecret || !stripePk) return null;

  const stripePromise = useMemo(() => loadStripe(stripePk), []);

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: { theme: 'night', variables: { borderRadius: '8px' } },
      }}
    >
      <StripeForm
        clientSecret={clientSecret}
        planId={planId}
        onSuccess={onSuccess}
        onError={onError}
        submitting={submitting}
        setSubmitting={setSubmitting}
      />
    </Elements>
  );
}
