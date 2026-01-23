'use client';

export default function DebugPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  return (
    <div className="min-h-screen bg-slate-950 p-8 text-white">
      <h1 className="text-2xl font-bold mb-4">Supabase Configuration Debug</h1>
      <div className="space-y-4">
        <div>
          <strong>NEXT_PUBLIC_SUPABASE_URL:</strong>
          <div className="mt-2 p-4 bg-slate-900 rounded">
            {supabaseUrl ? (
              <>
                <div className="text-green-400">✓ Set</div>
                <div className="text-sm text-slate-400 mt-2">
                  {supabaseUrl.substring(0, 30)}...
                </div>
              </>
            ) : (
              <div className="text-red-400">✗ Not set</div>
            )}
          </div>
        </div>
        <div>
          <strong>NEXT_PUBLIC_SUPABASE_ANON_KEY:</strong>
          <div className="mt-2 p-4 bg-slate-900 rounded">
            {supabaseKey ? (
              <>
                <div className="text-green-400">✓ Set</div>
                <div className="text-sm text-slate-400 mt-2">
                  Length: {supabaseKey.length} characters
                </div>
              </>
            ) : (
              <div className="text-red-400">✗ Not set</div>
            )}
          </div>
        </div>
        <div className="mt-6 p-4 bg-slate-900 rounded">
          <strong>Status:</strong>
          {supabaseUrl && supabaseKey ? (
            <div className="text-green-400 mt-2">✓ Supabase should be configured</div>
          ) : (
            <div className="text-red-400 mt-2">
              ✗ Supabase is not configured. Please set environment variables in Cloudflare Pages.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

