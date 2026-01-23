import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy initialization to avoid build-time errors when env vars aren't set
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

      // Always log in browser to help debug
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
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

  // Only create client if we have BOTH valid-looking values
  // Don't create with placeholder values - that causes 401 errors
  if (!supabaseUrl || !supabaseAnonKey) {
    if (typeof window !== 'undefined') {
      console.warn('Supabase env vars not found or incomplete:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseAnonKey,
      });
    }
    return null;
  }

  // Validate that URL looks like a Supabase URL
  if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
    if (typeof window !== 'undefined') {
      console.warn('Invalid Supabase URL format:', supabaseUrl.substring(0, 50));
    }
    return null;
  }

  // Validate that key looks like a JWT (starts with eyJ)
  if (!supabaseAnonKey.startsWith('eyJ')) {
    if (typeof window !== 'undefined') {
      console.warn('Invalid Supabase anon key format (should start with eyJ)');
    }
    return null;
  }

  // If we have a valid client already, return it
  if (supabaseClient) {
    return supabaseClient;
  }

  try {
    // Create client with validated values
    // Supabase client automatically sets Authorization header with the anon key
    // We only need to pass the key to createClient - don't manually set Authorization header
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false, // Disable for anonymous operations
        persistSession: false, // Don't persist session for anonymous users
        detectSessionInUrl: false, // Don't detect session in URL
      },
      // Don't manually set Authorization header - let Supabase client handle it
    });
    
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('Supabase client created successfully');
    }
    
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

