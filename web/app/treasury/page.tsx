import type { Metadata } from 'next';
import { TreasuryConsole } from '../treasury-console';
import { positionRoute } from '@/lib/position-route';

export const metadata: Metadata = {
  title: 'Your treasury — Breakwater',
  description:
    'Create and manage a treasury-owned Aqua position with explicit trading limits. Sepolia sample tokens only.',
  alternates: { canonical: '/treasury' },
  openGraph: {
    title: 'Your treasury — Breakwater',
    description:
      'Create and manage an Aqua position with explicit trading limits. Sepolia sample tokens only.',
    url: '/treasury',
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
    title: 'Your treasury — Breakwater',
    description:
      'Create and manage an Aqua position with explicit trading limits. Sepolia sample tokens only.',
    images: ['https://breakwater.dolepee.com/og.png'],
  },
};

export default async function Treasury({
  searchParams,
}: {
  searchParams: Promise<{ position?: string | string[] }>;
}) {
  const params = await searchParams;
  const route = positionRoute(params);
  return (
    <TreasuryConsole
      key={route.key}
      initialPosition={route.initialPosition}
      initialPositionError={route.initialPositionError}
    />
  );
}
