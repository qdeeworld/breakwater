'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { formatUnits } from 'viem';
import { Waves } from 'lucide-react';
import { discoverPositions } from '@/lib/discovery';
import { positionStatus } from '@/lib/position-status';
import { shortenHex } from '@/lib/breakwater';

const amount = (value: bigint) => formatUnits(value, 6);

export default function Positions() {
  const [result, setResult] =
    useState<Awaited<ReturnType<typeof discoverPositions>>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const noneReady =
    !!result?.entries.length &&
    result.entries.every(
      ({ position: p }) =>
        !p ||
        !positionStatus({
          ...p,
          healthy: p.observation.value?.[0],
          policyError: p.observation.error,
        }).tradable,
    );
  const sequence = useRef(0);
  async function refresh() {
    const id = ++sequence.current;
    setLoading(true);
    setError('');
    setResult(undefined);
    try {
      const next = await discoverPositions();
      if (id === sequence.current) setResult(next);
    } catch {
      if (id === sequence.current)
        setError(
          'Could not load positions from Sepolia. Retry discovery or open a position using its share link.',
        );
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    const id = ++sequence.current;
    void discoverPositions()
      .then((next) => {
        if (!cancelled && id === sequence.current) setResult(next);
      })
      .catch(() => {
        if (!cancelled && id === sequence.current)
          setError(
            'Could not load positions from Sepolia. Retry discovery or open a position using its share link.',
          );
      })
      .finally(() => {
        if (!cancelled && id === sequence.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className="site-shell maker-shell">
      <a className="skip-link" href="#positions">
        Skip to positions
      </a>
      <header className="topbar">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark">
            <Waves aria-hidden="true" />
          </span>
          Breakwater
        </Link>
        <span className="network-chip">Sepolia · no-value test tokens</span>
        <Link className="text-action" href="/">
          Create a position
        </Link>
      </header>
      <main className="main-content" id="positions">
        <section className="state-intro discovery-intro">
          <div>
            <h1>Find liquidity</h1>
            <p className="state-summary">
              Choose a position and quote a trade. No wallet needed to browse.
            </p>
          </div>
        </section>
        <section aria-labelledby="recent-positions">
          <div className="maker-heading">
            <h2 id="recent-positions">Recent positions</h2>
            <button
              className="text-action"
              disabled={loading}
              onClick={() => void refresh()}
            >
              {loading ? 'Reading Sepolia…' : 'Refresh positions'}
            </button>
          </div>
          <p className="discovery-context">
            Sepolia sample market · owner-controlled prices, not live feeds.
          </p>
          <output className="maker-status">
            {loading
              ? 'Loading position states and backing…'
              : result
                ? `${result.entries.length} ${result.entries.length === 1 ? 'position' : 'positions'} found.`
                : ''}
          </output>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {result?.entries.length === 0 && (
            <div className="position-panel maker-panel">
              <h3>No recent positions</h3>
              <p>
                Create and ship a position to make liquidity available, or use
                an existing position’s share link.
              </p>
              <Link className="text-action" href="/">
                Create a position
              </Link>
            </div>
          )}
          {noneReady && (
            <div className="position-panel maker-panel">
              <h3>No listed position is ready to quote</h3>
              <p>
                See each position’s reason below, or create your own sample
                allocation. Creating it does not supply a willing counterparty.
              </p>
              <Link className="text-action" href="/">
                Create a position
              </Link>
            </div>
          )}
          <div className="discovery-grid">
            {result?.entries.map(({ hash, position: p, error: entryError }) => {
              const state = p
                ? positionStatus({
                    ...p,
                    healthy: p.observation.value?.[0],
                    policyError: p.observation.error,
                  })
                : undefined;
              return (
                <article
                  className="position-panel maker-panel"
                  data-state={state?.label}
                  key={hash}
                >
                  <div>
                    <div className="market-pair">
                      <h3>bUSD / rUSD</h3>
                      <span className="market-state">
                        {state?.label ?? 'Unavailable'}
                      </span>
                    </div>
                    <p className="market-id">Position {shortenHex(hash)}</p>
                    <p>{state?.reason ?? entryError}</p>
                    {p && (
                      <p className="action-help">
                        Owner {shortenHex(p.owner)} · healthy fee{' '}
                        {(p.feeBps / 100).toFixed(2)}%
                      </p>
                    )}
                  </div>
                  {p && (
                    <>
                      <div className="liquidity-backing">
                        <dl className="maker-metrics">
                          <div>
                            <dt>Backed bUSD output</dt>
                            <dd>{amount(p.assetAvailable)}</dd>
                          </div>
                          <div>
                            <dt>Backed rUSD output</dt>
                            <dd>{amount(p.reserveAvailable)}</dd>
                          </div>
                        </dl>
                      </div>
                      <div className="position-open">
                        <Link
                          className={
                            state?.tradable
                              ? 'primary-action'
                              : 'secondary-action'
                          }
                          href={`/?position=${hash}`}
                          aria-label={`${state?.tradable ? 'Quote a trade' : 'View position'} ${shortenHex(hash)}`}
                        >
                          {state?.tradable ? 'Quote a trade' : 'View position'}{' '}
                          →
                        </Link>
                        <details className="market-read-details">
                          <summary>Backing details</summary>
                          <p>
                            Read at block {p.blockNumber.toString()}. Backing is
                            not a quote or reserved liquidity. Other fills,
                            wallet transfers and approvals can change it.
                          </p>
                        </details>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
          <details className="market-method">
            <summary>Discovery range and sample-price freshness</summary>
            <p className="action-help">
              Latest eight registrations within 20,000 blocks, including
              unavailable positions.{' '}
              {result
                ? `Scan: blocks ${result.scannedFrom}–${result.head}.`
                : ''}
            </p>
            <p className="action-help">
              Default sample observations expire after 24h for bUSD and 25h for
              rUSD. Only the position’s owner can update them. Refresh positions
              reads the chain; it does not refresh sample prices.
            </p>
          </details>
          <p className="action-help">
            An exit needs a willing buyer and a fresh executable quote. There is
            no guaranteed exit, redemption or recovery. Creating an allocation
            does not guarantee fills or earnings.
          </p>
        </section>
      </main>
    </div>
  );
}
