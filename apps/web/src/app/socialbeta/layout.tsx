import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#0f172a',
};

export const metadata: Metadata = {
  title: 'Get Free Credits | VANNILLI',
  description:
    'Claim 3 free credits. Verify your payment method (no charge) and create your account. Create hyper-real AI music videos.',
  openGraph: {
    title: 'Get Free Credits | VANNILLI',
    description: 'Claim 3 free credits. Verify payment method, create account, start creating.',
  },
};

export default function SocialBetaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
