import { TreasuryConsole } from './treasury-console';
import { LandingPage } from './landing-page';
import { positionRoute } from '@/lib/position-route';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ position?: string | string[] }>;
}) {
  const params = await searchParams;
  // Existing shared links retain the direct position journey.
  const route = positionRoute(params);
  return route.hasPosition ? (
    <TreasuryConsole
      key={route.key}
      initialPosition={route.initialPosition}
      initialPositionError={route.initialPositionError}
    />
  ) : (
    <LandingPage />
  );
}
