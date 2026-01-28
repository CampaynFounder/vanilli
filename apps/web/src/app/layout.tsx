import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { GlobalSignupModal } from '@/components/GlobalSignupModal';

const GA_MEASUREMENT_ID = 'G-RP6TSSJS3N';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#9333ea',
};

export const metadata: Metadata = {
  title: 'VANNILLI - Hyper-Realistic Lip Sync For AI Music Videos',
  description: 'Create professional music videos by paying for bars, not compute. Transform your performance into stunning AI-powered music videos.',
  keywords: ['music video', 'AI', 'video generation', 'music production', 'artist tools'],
  authors: [{ name: 'Vannilli Team' }],
  creator: 'Vannilli',
  publisher: 'Vannilli',
  metadataBase: new URL('https://vannilli.xaino.io'),
  openGraph: {
    title: 'VANNILLI - Hyper-Realistic Lip Sync For AI Music Videos',
    description: 'Create professional music videos by paying for bars, not compute',
    url: 'https://vannilli.xaino.io',
    siteName: 'Vannilli',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'VANNILLI - Hyper-Realistic Lip Sync For AI Music Videos',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VANNILLI - Hyper-Realistic Lip Sync For AI Music Videos',
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Poppins:wght@400;600;700&display=swap"
        />
        <link rel="preconnect" href="https://api.vannilli.xaino.io" />
        <link rel="dns-prefetch" href="https://api.vannilli.xaino.io" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Explicit favicon link for Google Search */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
      </head>
          <body className="font-sans antialiased min-h-screen">
            {children}
            <GlobalSignupModal />
            {/* Google tag (gtag.js) – conversions & behavior on home, auth, social signup */}
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </body>
    </html>
  );
}

