import type { Metadata, Viewport } from 'next';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource-variable/manrope';
import '@fontsource-variable/geist';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';
import './workspace.css';
import './aperture.css';

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
      'Treasury-owned liquidity with trading fees and explicit risk limits. Try Aqua and SwapVM on Sepolia with no-value test tokens.',
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
      'Treasury-owned liquidity with trading fees and explicit risk limits. Try Aqua and SwapVM on Sepolia with no-value test tokens.',
    images: ['https://breakwater.dolepee.com/og.png'],
  },
};

export const viewport: Viewport = { themeColor: '#0C282C' };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div
          hidden
          dangerouslySetInnerHTML={{
            __html:
              '<!-- THESIS: Treasury liquidity with selective permissions, not a generic dashboard hero. OWN-WORLD: Petrol, mineral light, brushed pewter aperture, broad grotesk type, rounded actions. STORY: Understand the policy, open the real treasury, inspect actual outcomes. FIRST VIEWPORT: Left promise and app action; monumental aperture right; light permissions below. FORM: Selective aperture, grounded index 1, user-selected pick, seed dad3d530. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance -->',
          }}
        />
        <div className="workspace-content" id="workspace-content" tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  );
}
