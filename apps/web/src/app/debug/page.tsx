'use client';

import { useState } from 'react';

export default function DebugPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const testVideoApiUrl = process.env.NEXT_PUBLIC_MODAL_TEST_VIDEO_API_URL || '';

  const [videoApiResult, setVideoApiResult] = useState<{
    ok: boolean;
    message: string;
    jwt?: string;
    payload_redacted?: { ak: string; iat: number; exp: number };
    expires_in?: number;
    verify_status?: number;
    verify_message?: string;
  } | null>(null);
  const [videoApiLoading, setVideoApiLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerateJwt = async () => {
    if (!testVideoApiUrl) return;
    setVideoApiLoading(true);
    setVideoApiResult(null);
    setCopied(false);
    try {
      const r = await fetch(testVideoApiUrl, { method: 'GET' });
      const j = await r.json().catch(() => ({}));
      setVideoApiResult({
        ok: j.ok === true,
        message: j.message || (r.ok ? 'OK' : `HTTP ${r.status}`),
        jwt: j.jwt,
        payload_redacted: j.payload_redacted,
        expires_in: j.expires_in,
        verify_status: j.verify_status,
        verify_message: j.verify_message,
      });
    } catch (e) {
      setVideoApiResult({ ok: false, message: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setVideoApiLoading(false);
    }
  };

  const copyJwt = () => {
    if (!videoApiResult?.jwt) return;
    void navigator.clipboard.writeText(videoApiResult.jwt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
        {/* Generate JWT from Modal secrets — only if NEXT_PUBLIC_MODAL_TEST_VIDEO_API_URL is set */}
        {testVideoApiUrl && (
          <div className="p-4 bg-slate-900 rounded">
            <strong>Generate JWT (from Modal secrets)</strong>
            <p className="text-sm text-slate-400 mt-1 mb-2">
              Builds a JWT from KLING_ACCESS_KEY + KLING_API_KEY in Modal&apos;s vannilli-secrets. Copy the JWT and paste it into Kling&apos;s verification tool to confirm the keys work.
            </p>
            <button
              type="button"
              onClick={handleGenerateJwt}
              disabled={videoApiLoading}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded text-sm font-medium"
            >
              {videoApiLoading ? 'Generating…' : 'Generate JWT'}
            </button>
            {videoApiResult && (
              <div className="mt-3 space-y-2">
                {videoApiResult.jwt ? (
                  <div className="p-3 rounded bg-slate-800">
                    <p className="text-xs text-slate-400 mb-1">JWT (paste into Kling&apos;s verifier):</p>
                    <div className="flex gap-2">
                      <textarea
                        readOnly
                        value={videoApiResult.jwt}
                        className="flex-1 min-h-[80px] p-2 rounded bg-slate-900 text-green-300 text-xs font-mono"
                        onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                      />
                      <button
                        type="button"
                        onClick={copyJwt}
                        className="self-start px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm shrink-0"
                      >
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    {videoApiResult.payload_redacted && (
                      <p className="text-xs text-slate-500 mt-1">
                        Payload (redacted): ak={videoApiResult.payload_redacted.ak}, iat={videoApiResult.payload_redacted.iat}, exp={videoApiResult.payload_redacted.exp}
                        {videoApiResult.expires_in != null && ` · expires in ${videoApiResult.expires_in}s`}
                      </p>
                    )}
                  </div>
                ) : null}
                <div className={`p-3 rounded text-sm ${videoApiResult.ok ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
                  {videoApiResult.ok ? '✓' : '✗'} {videoApiResult.verify_message ?? videoApiResult.message}
                  {videoApiResult.verify_status != null && <span> (HTTP {videoApiResult.verify_status})</span>}
                </div>
              </div>
            )}
          </div>
        )}

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

