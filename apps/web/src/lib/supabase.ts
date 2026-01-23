import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy initialization to avoid build-time errors when env vars aren't set
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  // Only create client if we have the required env vars
  // During build, these might be empty, so we create a dummy client
  if (!supabaseUrl || !supabaseAnonKey) {
    // Create a client with placeholder values for build-time
    // This will fail at runtime if env vars aren't set, but allows build to complete
    supabaseClient = createClient(
      supabaseUrl || 'https://placeholder.supabase.co',
      supabaseAnonKey || 'placeholder-key',
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      }
    );
  } else {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }

  return supabaseClient;
}

// Export a getter function instead of direct client
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getSupabaseClient()[prop as keyof SupabaseClient];
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

