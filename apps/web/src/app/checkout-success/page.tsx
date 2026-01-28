'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { Suspense } from 'react';
import { DirectorTrainingTutorial } from '@/components/tutorial/DirectorTrainingTutorial';

function CheckoutSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, session, loading } = useAuth();
  const [creditsConfirmed, setCreditsConfirmed] = useState(false);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const product = searchParams?.get('product') || 'demo';
  const maxPollingAttempts = 10; // 10 attempts = ~15 seconds

  useEffect(() => {
    if (loading) return;

    if (!user || !session) {
      const redirectUrl = '/checkout-success?product=' + product;
      router.push('/auth/signin?redirect=' + encodeURIComponent(redirectUrl));
      return;
    }

    const uid = user.id;
    const previousCredits = user.creditsRemaining ?? 0;

    const checkCredits = async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('users')
        .select('credits_remaining, tier')
        .eq('id', uid)
        .single();

      if (error || !data) return false;

      const credits = (data as { credits_remaining?: number }).credits_remaining ?? 0;
      const tier = (data as { tier?: string }).tier;

      setCreditsRemaining(credits);
      const creditIncrease = credits - previousCredits;
      const hasSeenTutorial = typeof window !== 'undefined' && localStorage.getItem('vannilli_tutorial_seen');
      const isFirstTimeFreeCredits = creditIncrease === 3 && previousCredits === 0 && credits === 3 && !hasSeenTutorial;

      if (product === 'free_credits' && credits === 3 && previousCredits === 0) {
        setCreditsConfirmed(true);
        if (isFirstTimeFreeCredits) setShowTutorial(true);
        return true;
      }
      if (product === 'demo' && tier === 'demo' && credits >= 20) {
        setCreditsConfirmed(true);
        if (isFirstTimeFreeCredits) setShowTutorial(true);
        return true;
      }
      if (product !== 'demo' && product !== 'free_credits' && credits > previousCredits) {
        setCreditsConfirmed(true);
        if (isFirstTimeFreeCredits) setShowTutorial(true);
        return true;
      }
      if (isFirstTimeFreeCredits) {
        setCreditsConfirmed(true);
        setShowTutorial(true);
        return true;
      }
      return false;
    };

    let attempts = 0;

    const runPoll = () => {
      attempts++;
      if (attempts >= maxPollingAttempts) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setError('Credits may still be processing. Please refresh the page in a moment.');
        return;
      }
      checkCredits().then((confirmed) => {
        if (confirmed && pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      });
    };

    checkCredits().then((confirmed) => {
      if (confirmed) return;
      pollIntervalRef.current = setInterval(runPoll, 1500);
    });

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [user?.id, session?.access_token, product, router, loading]);

  const productNames: Record<string, string> = {
    demo: 'DEMO',
    industry: 'Industry',
    label: 'Label',
    artist: 'Artist',
    open_mic: 'Open Mic',
    free_credits: 'Free Credits',
  };

  const productName = productNames[product] || 'Tier';

  const handleTutorialComplete = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('vannilli_tutorial_seen', 'true');
    }
    router.push('/studio');
  };

  const handleTutorialSkip = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('vannilli_tutorial_seen', 'true');
    }
    router.push('/studio');
  };

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
            {showTutorial ? (
              <DirectorTrainingTutorial onComplete={handleTutorialComplete} onSkip={handleTutorialSkip} />
            ) : (
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
            )}
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
