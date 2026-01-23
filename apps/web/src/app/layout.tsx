import type { Metadata, Viewport } from 'next';
import { Inter, Poppins } from 'next/font/google';
import './globals.css';
import { GlobalSignupModal } from '@/components/GlobalSignupModal';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const poppins = Poppins({
  weight: ['400', '600', '700'],
  subsets: ['latin'],
  variable: '--font-poppins',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#9333ea',
};

export const metadata: Metadata = {
  title: 'Vannilli - Music Video AI Platform',
  description: 'Create professional music videos by paying for bars, not compute. Transform your performance into stunning AI-powered music videos.',
  keywords: ['music video', 'AI', 'video generation', 'music production', 'artist tools'],
  authors: [{ name: 'Vannilli Team' }],
  creator: 'Vannilli',
  publisher: 'Vannilli',
  metadataBase: new URL('https://vannilli.xaino.io'),
  openGraph: {
    title: 'Vannilli - Music Video AI Platform',
    description: 'Create professional music videos by paying for bars, not compute',
    url: 'https://vannilli.xaino.io',
    siteName: 'Vannilli',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Vannilli Music Video AI',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vannilli - Music Video AI Platform',
    description: 'Create professional music videos by paying for bars, not compute',
    images: ['/og-image.jpg'],
    creator: '@VannilliAI',
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Vannilli',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable}`}>
      <head>
        <link rel="preconnect" href="https://api.vannilli.xaino.io" />
        <link rel="dns-prefetch" href="https://api.vannilli.xaino.io" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
          <body className="font-sans antialiased min-h-screen">
            {children}
            <GlobalSignupModal />
          </body>
    </html>
  );
}

