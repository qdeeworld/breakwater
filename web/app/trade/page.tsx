import { BreakwaterConsole } from '../breakwater-console';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trade the original sample position — Breakwater',
  description:
    'Trade the original fixed-price Breakwater sample market on Sepolia. No-value tokens, not live market prices.',
  alternates: { canonical: '/trade' },
  openGraph: {
    title: 'Trade the original sample position — Breakwater',
    url: '/trade',
    description:
      'The original fixed-price Sepolia sample market. No-value tokens, not live market prices.',
  },
};

export default function Trade() {
  return <BreakwaterConsole />;
}
