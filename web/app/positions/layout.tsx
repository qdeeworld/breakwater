import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Find liquidity — Breakwater',
  description:
    'Browse treasury positions and quote permitted trades without connecting a wallet. Sepolia no-value sample tokens.',
  alternates: { canonical: '/positions' },
  openGraph: {
    title: 'Find liquidity — Breakwater',
    description:
      'Browse treasury positions and quote permitted trades. Sepolia no-value sample tokens.',
    url: '/positions',
    images: [
      {
        url: 'https://breakwater.dolepee.com/og.png',
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Find liquidity — Breakwater',
    description:
      'Browse treasury positions and quote permitted trades. Sepolia no-value sample tokens.',
    images: ['https://breakwater.dolepee.com/og.png'],
  },
};

export default function PositionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
