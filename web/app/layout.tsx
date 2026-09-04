import type { Metadata, Viewport } from 'next';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource-variable/manrope';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://breakwater.qdworld001.chatgpt.site'),
  title: 'Breakwater — Aqua liquidity that stops buying the depeg',
  description:
    'Execute a guarded treasury unwind through 1inch Aqua and SwapVM when a stablecoin leaves its safety band.',
  alternates: { canonical: '/' },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Breakwater',
    description: 'Aqua liquidity that stops buying the depeg.',
    url: '/',
    siteName: 'Breakwater',
    type: 'website',
    images: [
      {
        url: 'https://breakwater.qdworld001.chatgpt.site/og.png',
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
    description: 'Aqua liquidity that stops buying the depeg.',
    images: ['https://breakwater.qdworld001.chatgpt.site/og.png'],
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
