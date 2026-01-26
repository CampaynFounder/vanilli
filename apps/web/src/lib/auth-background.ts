/**
 * Auth background image(s) shown behind sign-in, sign-up, and the signup modal.
 * Add paths here when you add images under /public/images/auth/.
 * With 2+ entries, one is chosen at random per view.
 */
export const AUTH_BG_IMAGES = ['/images/auth/auth-bg-1.jpg'] as const;

export function getAuthBackgroundUrl(): string {
  const i = Math.floor(Math.random() * AUTH_BG_IMAGES.length);
  return AUTH_BG_IMAGES[i] ?? '/images/hero-background.png';
}
