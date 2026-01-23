import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy initialization to avoid build-time errors when env vars aren't set
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  // Always log in browser to help debug
  if (typeof window !== 'undefined') {
    console.log('Supabase Config Check:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseAnonKey,
      urlLength: supabaseUrl.length,
      keyLength: supabaseAnonKey.length,
      urlPreview: supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'empty',
      urlStartsWith: supabaseUrl ? supabaseUrl.substring(0, 8) : 'none',
      keyStartsWith: supabaseAnonKey ? supabaseAnonKey.substring(0, 10) : 'none'
    });
  }

  // Only return null if both are completely empty (not set at all)
  // Otherwise, try to create the client and let it fail gracefully if invalid
  if (!supabaseUrl && !supabaseAnonKey) {
    if (typeof window !== 'undefined') {
      console.warn('Supabase env vars not found');
    }
    return null;
  }

  // If we have values, try to create the client (even if they might be invalid)
  // This allows the actual Supabase API to return proper errors
  if (supabaseClient) {
    return supabaseClient;
  }

  try {
    // Create client with whatever values we have
    // Supabase will return proper errors if they're invalid
    supabaseClient = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-key', {
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
// Always try to use the real client if possible
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    // If we have a client (even if env vars might be placeholders), use it
    // This allows Supabase to return real API errors instead of our mock errors
    if (client) {
      return client[prop as keyof SupabaseClient];
    }
    
    // Only return mock if we truly have no client
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

