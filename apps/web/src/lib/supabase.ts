import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy initialization to avoid build-time errors when env vars aren't set
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  // Debug logging (only in development)
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('Supabase Config Check:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseAnonKey,
      urlLength: supabaseUrl.length,
      keyLength: supabaseAnonKey.length,
      urlPreview: supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'empty'
    });
  }

  // Return null if env vars aren't set (instead of creating invalid client)
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) {
    if (typeof window !== 'undefined') {
      console.warn('Supabase not configured:', {
        url: supabaseUrl || 'missing',
        key: supabaseAnonKey ? 'present' : 'missing'
      });
    }
    return null;
  }

  if (supabaseClient) {
    return supabaseClient;
  }

  try {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
    return supabaseClient;
  } catch (error) {
    console.error('Error creating Supabase client:', error);
    return null;
  }
}

// Export a getter function instead of direct client
// Returns null if Supabase is not configured
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    if (!client) {
      // Return a mock query builder for 'from' method
      if (prop === 'from') {
        return () => ({
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ 
                data: null, 
                error: { 
                  message: 'Supabase not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.',
                  code: 'CONFIG_ERROR'
                } 
              })
            })
          })
        });
      }
      // Return a no-op function for other methods
      if (typeof prop === 'string') {
        return () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } });
      }
      return null;
    }
    return client[prop as keyof SupabaseClient];
  },
});

export async function getSession() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session;
}

export async function getUser() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  return data.user;
}

export async function signOut() {
  const client = getSupabaseClient();
  if (!client) return;
  await client.auth.signOut();
}

