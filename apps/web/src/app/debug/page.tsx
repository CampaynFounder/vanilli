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
            <div className="text-green-400 mt-2">
              ✓ Variables are set in the build
              <div className="text-sm text-slate-400 mt-2">
                If you still see "not configured" errors, the build may have happened before the variables were set.
                <br />
                <strong>Solution:</strong> Trigger a new deployment in Cloudflare Pages after setting the variables.
              </div>
            </div>
          ) : (
            <div className="text-red-400 mt-2">
              ✗ Supabase is not configured in this build.
              <div className="text-sm text-slate-400 mt-2">
                <strong>Important:</strong> With static export, environment variables must be set BEFORE the build runs.
                <br />
                <br />
                Steps to fix:
                <ol className="list-decimal list-inside mt-2 space-y-1">
                  <li>Set NEXT_PUBLIC_SUPABASE_URL in Cloudflare Pages → Settings → Environment Variables</li>
                  <li>Set NEXT_PUBLIC_SUPABASE_ANON_KEY in Cloudflare Pages → Settings → Environment Variables</li>
                  <li>Trigger a NEW deployment (the build needs to run with the variables available)</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

