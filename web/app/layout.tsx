import type { Metadata, Viewport } from 'next';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource-variable/manrope';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://breakwater.dolepee.com'),
  title: 'Breakwater — Treasury liquidity with explicit risk limits',
  description:
    'Create treasury-owned Aqua liquidity, track settled trading fees, and enforce explicit limits with SwapVM. Try the lifecycle with no-value Sepolia tokens.',
  alternates: { canonical: '/' },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Breakwater',
    description:
      'Treasury-owned liquidity with trading fees and explicit risk limits, enforced through Aqua and SwapVM.',
    url: '/',
    siteName: 'Breakwater',
    type: 'website',
    images: [
      {
        url: 'https://breakwater.dolepee.com/og.png',
        width: 1200,
        height: 630,
        alt: 'Breakwater treasury tide gate between impaired and reserve assets',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Breakwater',
    description:
      'Treasury-owned liquidity with trading fees and explicit risk limits, enforced through Aqua and SwapVM.',
    images: ['https://breakwater.dolepee.com/og.png'],
  },
};

export const viewport: Viewport = { themeColor: '#EAF2F5' };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
