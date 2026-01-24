'use client';

import { useEffect, useState } from 'react';
import { supabase, getSession, getUser, signOut as supabaseSignOut } from './supabase';

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
  session: any | null;
}

/**
 * Client-side authentication hook
 * Checks Supabase session and fetches user data from API
 */
export function useAuth(): AuthState & {
  signIn: (email: string, password: string) => Promise<{ error?: any }>;
  signUp: (email: string, password: string) => Promise<{ error?: any }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
} {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any | null>(null);

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

      // Try to fetch from backend API
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.vannilli.xaino.io';
      
      try {
        const response = await fetch(`${apiUrl}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${currentSession.access_token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setUser({
            id: data.id,
            email: data.email,
            tier: data.tier,
            creditsRemaining: data.creditsRemaining,
            freeGenerationRedeemed: data.freeGenerationRedeemed,
            avatarUrl: data.avatarUrl,
          });
          setLoading(false);
          return;
        }
      } catch (apiError) {
        console.warn('Backend API not available, using Supabase user data only');
      }

      // Fallback: Use Supabase user data directly
      const supabaseUser = currentSession.user;
      if (supabaseUser) {
        setUser({
          id: supabaseUser.id,
          email: supabaseUser.email || '',
          tier: 'free', // Default tier when backend is unavailable
          creditsRemaining: 0,
          freeGenerationRedeemed: false,
          avatarUrl: supabaseUser.user_metadata?.avatar_url,
        });
      } else {
        setUser(null);
        setSession(null);
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
      async (event, session) => {
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
