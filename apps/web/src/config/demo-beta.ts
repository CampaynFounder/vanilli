/**
 * Demo tier beta: only these emails can access demo tier (multi-image, queue, etc.).
 * Others with tier 'demo' in DB are treated as not having demo access.
 */
export const DEMO_BETA_ALLOWLIST: string[] = ['pass5@gmail.com'];

export function canUseDemoTier(email: string | null | undefined): boolean {
  if (!email) return false;
  return DEMO_BETA_ALLOWLIST.includes(email.trim().toLowerCase());
}
