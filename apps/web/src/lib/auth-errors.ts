/**
 * Auth error helpers.
 * When Supabase has "Allow new users to sign up" disabled, signUp returns
 * an error like "Signups not allowed for this instance" (or "component").
 */

export const INSTAGRAM_LAUNCH_URL =
  'https://www.instagram.com/vannilli.ai?igsh=MXdpZmcweDZnd2M2cA==';

/** True when the error indicates new signups are disabled in Supabase. */
export function isSignupsDisabledError(message: string | undefined): boolean {
  if (!message || typeof message !== 'string') return false;
  const m = message.toLowerCase();
  return (
    /signups?\s*not\s*allowed/i.test(m) ||
    /new\s*signups?\s*disabled/i.test(m)
  );
}
