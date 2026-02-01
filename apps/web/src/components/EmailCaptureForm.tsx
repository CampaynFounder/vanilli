'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

/**
 * Shown when signup is restricted to /socialbeta only.
 * Saves email to email_collections for launch notification.
 */
export function EmailCaptureForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error: err } = await supabase.from('email_collections').insert({
        email: email.toLowerCase().trim(),
        phone: '-',
        is_investor: false,
        source: 'other',
      });
      if (err) throw err;
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-4">
        <p className="text-green-400 text-sm font-medium">We&apos;ve got it!</p>
        <p className="text-slate-400 text-sm">
          We&apos;ll notify you at <span className="text-white">{email}</span> when we launch.
        </p>
        <Link
          href="/socialbeta"
          className="block w-full py-3 text-center rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold transition-all"
        >
          Get Free Credits Now →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-slate-400 text-sm">
        Sign up is currently available on our launch page. Enter your email to get notified, or go there now.
      </p>
      <div>
        <label htmlFor="capture-email" className="block text-sm font-medium text-slate-300 mb-2">
          Email
        </label>
        <input
          id="capture-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@example.com"
          className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-60 text-white font-semibold transition-all"
        >
          {loading ? 'Saving…' : 'Notify Me'}
        </button>
        <Link
          href="/socialbeta"
          className="w-full py-3 text-center rounded-xl border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white font-semibold transition-all"
        >
          Get Free Credits Now
        </Link>
      </div>
    </form>
  );
}
