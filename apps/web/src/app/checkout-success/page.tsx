'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { Suspense } from 'react';

function CheckoutSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, refreshUser, session, loading } = useAuth();
  const [creditsConfirmed, setCreditsConfirmed] = useState(false);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const product = searchParams?.get('product') || 'demo';
  const maxPollingAttempts = 10; // 10 attempts = ~15 seconds

  useEffect(() => {
    // Wait for auth to finish loading before checking
    if (loading) return;
    
    // Only redirect if we're sure the user is not authenticated (not just loading)
    if (!user || !session) {
      const redirectUrl = '/checkout-success?product=' + product;
      router.push('/auth/signin?redirect=' + encodeURIComponent(redirectUrl));
      return;
    }

    const checkCredits = async (): Promise<boolean> => {
      await refreshUser();
      // Use the supabase client from lib which already has the session configured
      const { data, error } = await supabase
        .from('users')
        .select('credits_remaining, tier')
        .eq('id', user.id)
        .single();
      
      if (!error && data) {
        const credits = (data as { credits_remaining?: number }).credits_remaining ?? 0;
        const tier = (data as { tier?: string }).tier;
        setCreditsRemaining(credits);
        
        // For DEMO tier, check if credits are 20 or more
        if (product === 'demo' && tier === 'demo' && credits >= 20) {
          setCreditsConfirmed(true);
          return true;
        }
        
        // For other products, check if credits increased
        if (product !== 'demo' && credits > (user.creditsRemaining || 0)) {
          setCreditsConfirmed(true);
          return true;
        }
      }
      return false;
    };

    // Initial check
    let intervalId: NodeJS.Timeout | null = null;
    
    checkCredits().then((confirmed) => {
      if (confirmed) return;
      
      // Start polling if not confirmed
      let attempts = 0;
      intervalId = setInterval(async () => {
        attempts++;
        
        if (attempts >= maxPollingAttempts) {
          if (intervalId) clearInterval(intervalId);
          setError('Credits may still be processing. Please refresh the page in a moment.');
          return;
        }
        
        const confirmed = await checkCredits();
        if (confirmed && intervalId) {
          clearInterval(intervalId);
        }
      }, 1500);
    });

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [user?.id, session?.access_token, product, refreshUser, router, loading]);

  const productNames: Record<string, string> = {
    demo: 'DEMO',
    industry: 'Industry',
    label: 'Label',
    artist: 'Artist',
    open_mic: 'Open Mic',
  };

  const productName = productNames[product] || 'Tier';

  // Show loading state while auth is loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-slate-950">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-950">
      <div className="max-w-2xl w-full text-center">
        {creditsConfirmed ? (
          <>
            {/* Celebration Animation */}
            <div className="mb-8 flex justify-center">
              <div className="relative w-64 h-64 md:w-80 md:h-80">
                {/* Animated confetti/celebration effect */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-8xl md:text-9xl animate-bounce">🎉</div>
                </div>
                {/* Optional: Add MP4/GIF here */}
                {/* <video autoPlay loop muted className="w-full h-full object-contain">
                  <source src="/celebration.mp4" type="video/mp4" />
                </video> */}
              </div>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Congratulations! 🎊
            </h1>
            <p className="text-xl md:text-2xl text-slate-300 mb-2">
              You've successfully enrolled in the {productName} tier!
            </p>
            {creditsRemaining !== null && (
              <p className="text-lg text-purple-400 font-semibold mb-8">
                You now have {creditsRemaining} credits
              </p>
            )}
            <Link
              href="/studio"
              className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
            >
              Go to Studio
            </Link>
          </>
        ) : error ? (
          <>
            <div className="mb-8">
              <div className="text-6xl mb-4">⚠️</div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Processing...
              </h1>
              <p className="text-lg text-slate-300 mb-4">{error}</p>
              <Link
                href="/studio"
                className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
              >
                Go to Studio
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="mb-8">
              <div className="inline-block animate-spin text-6xl mb-4">⏳</div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Confirming Your Enrollment...
              </h1>
              <p className="text-lg text-slate-300">
                Please wait while we confirm your {productName} tier enrollment and credits.
              </p>
              {creditsRemaining !== null && (
                <p className="text-sm text-slate-400 mt-2">
                  Current credits: {creditsRemaining}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-white text-xl">Loading...</div>
      </div>
    }>
      <CheckoutSuccessContent />
    </Suspense>
  );
}
