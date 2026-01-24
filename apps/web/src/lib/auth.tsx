'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, getSession, signOut as supabaseSignOut } from './supabase';

export interface User {
  id: string;
  email: string;
  tier: 'free' | 'open_mic' | 'indie_artist' | 'artist' | 'label';
  creditsRemaining: number;
  freeGenerationRedeemed: boolean;
  avatarUrl?: string;
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
        if (u) setUser({ id: u.id, email: u.email || '', tier: 'free', creditsRemaining: 0, freeGenerationRedeemed: false, avatarUrl: u.user_metadata?.avatar_url });
        else { setUser(null); setSession(null); }
      };
      if (!uid) { fallback(); setLoading(false); return; }
      const { data, error } = await supabase.from('users').select('id,email,tier,credits_remaining,free_generation_redeemed,avatar_url').eq('id', uid).single();
      if (!error && data) {
        setUser({ id: data.id, email: data.email, tier: data.tier, creditsRemaining: data.credits_remaining ?? 0, freeGenerationRedeemed: data.free_generation_redeemed ?? false, avatarUrl: data.avatar_url });
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

    return <Component {...props} />;
  };
}
