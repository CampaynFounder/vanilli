'use client';

/**
 * Hero/header background image used as the full-viewport background for logged-in
 * app views (Profile, Studio, History, Pricing). Matches the landing hero image
 * with overlays so content stays readable.
 */
export function AppBackground() {
  return (
    <>
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: 'url(/images/hero-background.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      <div className="fixed inset-0 bg-slate-950/55 z-[1]" />
      <div className="fixed inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/50 to-slate-950/70 z-[2] pointer-events-none" />
    </>
  );
}
