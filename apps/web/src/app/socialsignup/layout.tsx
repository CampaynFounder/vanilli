import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#0f172a',
};

export const metadata: Metadata = {
  title: 'Get Your AI Artist Signed | VANNILLI',
  description:
    'Create hyper-real, industry-approved music videos and content. Sign up to claim free credits and join companies and labels looking to sign AI artists.',
  openGraph: {
    title: 'Get Your AI Artist Signed | VANNILLI',
    description: 'Create hyper-real, industry-approved music videos. Claim free credits.',
  },
};

export default function SocialSignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
