import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy initialization to avoid build-time errors when env vars aren't set
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  // Return null if env vars aren't set (instead of creating invalid client)
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) {
    return null;
  }

  if (supabaseClient) {
    return supabaseClient;
  }

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClient;
}

// Export a getter function instead of direct client
// Returns null if Supabase is not configured
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    if (!client) {
      // Return a no-op function for methods, null for properties
      if (typeof prop === 'string' && prop !== 'from') {
        return () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } });
      }
      return null;
    }
    return client[prop as keyof SupabaseClient];
  },
});

export async function getSession() {
  const client = getSupabaseClient();
  const { data } = await client.auth.getSession();
  return data.session;
}

export async function getUser() {
  const client = getSupabaseClient();
  const { data } = await client.auth.getUser();
  return data.user;
}

export async function signOut() {
  const client = getSupabaseClient();
  await client.auth.signOut();
}

