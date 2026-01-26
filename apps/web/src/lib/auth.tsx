'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabase, getSession, signOut as supabaseSignOut } from './supabase';

export interface User {
  id: string;
  email: string;
  tier: 'free' | 'open_mic' | 'artist' | 'label' | 'industry' | 'demo';
  creditsRemaining: number;
  freeGenerationRedeemed: boolean;
  avatarUrl?: string;
  /** Must be true to use Studio, History, or purchase credits. Set when a payment method is linked. */
  hasValidCard?: boolean;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  session: Session | null;
}

/**
 * Client-side authentication hook
 * Checks Supabase session and fetches user data from API
 */
export function useAuth(): AuthState & {
  signIn: (email: string, password: string) => Promise<{ error?: { message?: string } | null }>;
  signUp: (email: string, password: string) => Promise<{ error?: { message?: string } | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
} {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const referralApplyInFlight = useRef(false);

  const fetchUserProfile = async () => {
    try {
      const currentSession = await getSession();
      if (!currentSession) {
        setUser(null);
        setSession(null);
        setLoading(false);
        return;
      }

      setSession(currentSession);
      const uid = currentSession.user?.id;
      const fallback = () => {
        const u = currentSession.user;
        if (u) setUser({ id: u.id, email: u.email || '', tier: 'free', creditsRemaining: 0, freeGenerationRedeemed: false, avatarUrl: u.user_metadata?.avatar_url, hasValidCard: false });
        else { setUser(null); setSession(null); }
      };
      if (!uid) { fallback(); setLoading(false); return; }
      const { data, error } = await supabase.from('users').select('id,email,tier,credits_remaining,free_generation_redeemed,avatar_url,has_valid_card').eq('id', uid);
      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
      if (!error && row) {
        const email = (row.email && row.email.endsWith('@auth.local') && currentSession?.user?.email) ? currentSession.user.email : row.email;
        // Type assertion: ensure tier matches User interface (no indie_artist, includes industry)
        const tier = (row.tier === 'indie_artist' ? 'artist' : row.tier) as User['tier'];
        setUser({ id: row.id, email: email || '', tier, creditsRemaining: row.credits_remaining ?? 0, freeGenerationRedeemed: row.free_generation_redeemed ?? false, avatarUrl: row.avatar_url, hasValidCard: row.has_valid_card === true });
      } else {
        fallback();
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setUser(null);
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserProfile();

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, _session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          fetchUserProfile();
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setSession(null);
          setLoading(false);
        }
      }
    );

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id || !user || referralApplyInFlight.current) return;
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('vannilli_referral_code');
    if (!stored) return;
    const referralCode = stored.trim();
    if (!referralCode) return;
    const appliedCode = localStorage.getItem('vannilli_referral_applied_code');
    if (appliedCode === referralCode) {
      localStorage.removeItem('vannilli_referral_code');
      return;
    }

    const applyReferral = async () => {
      referralApplyInFlight.current = true;
      try {
        const { error } = await supabase.rpc('apply_referral', {
          p_referral_code: referralCode,
          p_referred_product: 'open_mic',
        });
        if (!error) {
          localStorage.setItem('vannilli_referral_applied_code', referralCode);
          localStorage.removeItem('vannilli_referral_code');
        } else {
          console.warn('[vannilli] apply_referral error:', error);
        }
      } catch (err) {
        console.warn('[vannilli] apply_referral failed:', err);
      } finally {
        referralApplyInFlight.current = false;
      }
    };

    applyReferral();
  }, [session?.user?.id, user]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!error) {
      await fetchUserProfile();
    }

    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (!error) {
      await fetchUserProfile();
    }

    return { error };
  };

  const signOut = async () => {
    await supabaseSignOut();
    setUser(null);
    setSession(null);
  };

  const refreshUser = async () => {
    await fetchUserProfile();
  };

  return {
    user,
    loading,
    session,
    signIn,
    signUp,
    signOut,
    refreshUser,
  };
}

/**
 * Require authentication wrapper for pages
 * Redirects to home if not authenticated
 */
export function withAuth<P extends object>(
  Component: React.ComponentType<P>
): React.FC<P> {
  return function AuthenticatedComponent(props: P) {
    const { user, loading } = useAuth();
    const [shouldRedirect, setShouldRedirect] = useState(false);
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
      if (!loading && !user) {
        setShouldRedirect(true);
      }
    }, [user, loading]);

    useEffect(() => {
      if (shouldRedirect && typeof window !== 'undefined') {
        window.location.href = '/';
      }
    }, [shouldRedirect]);

    // Must link a payment method before using Studio, History, etc. Profile is the only place to link.
    useEffect(() => {
      if (loading || !user || user.hasValidCard === true) return;
      if (pathname === '/profile' || !pathname) return;
      router.replace('/profile?link_required=1');
    }, [loading, user, pathname, router]);

    if (loading) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="spinner w-12 h-12"></div>
        </div>
      );
    }

    if (!user) {
      return null;
    }

    // Avoid flashing gated content while redirecting to /profile to link payment method
    if (user.hasValidCard !== true && pathname !== '/profile') {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="spinner w-12 h-12"></div>
        </div>
      );
    }

    return <Component {...props} />;
  };
}
