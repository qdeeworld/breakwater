'use client';
import { useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { ArrowUpRight, FlaskConical, ShieldCheck } from 'lucide-react';
import {
  amount,
  healthyQuote,
  settingsKey,
  type Settings,
} from '@/lib/rehearsal-math';
import { checkpoints, rehearse } from '@/lib/rehearsal';
import type { RehearsalResult } from '@/lib/rehearsal';
const fmt = (n: bigint) => {
  const [whole, fraction] = formatUnits(n, 6).split('.');
  return (
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') +
    (fraction ? '.' + fraction : '')
  );
};
const price = (value: string) =>
  Number(formatUnits(BigInt(value), 18)).toFixed(4);
const signed = (n: bigint) => `${n > 0n ? '+' : ''}${fmt(n)}`;
const names = ['Before the shock', 'Depeg begins', 'Deeper stress', 'Recovery'];
const titles = [
  'Your policy',
  'Without acquisition guard',
  'Halt / direct exit',
];
export function PolicyRehearsal({
  settings,
  onReviewed,
}: {
  settings?: Settings;
  onReviewed: (key: string) => void;
}) {
  const [index, setIndex] = useState(1),
    [sizeInput, setSizeInput] = useState<string>();
  const [result, setResult] = useState<{
    key: string;
    value: RehearsalResult;
  }>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const sequence = useRef(0);
  const sizeText =
    sizeInput ??
    (settings ? formatUnits(settings.assetAllocation / 10n || 1n, 6) : '10');
  const key = settings ? `${settingsKey(settings)}:${sizeText}:${index}` : '';
  const current = result?.key === key ? result.value : undefined;
  let offered: ReturnType<typeof healthyQuote> | undefined;
  try {
    if (settings) offered = healthyQuote(settings, amount(sizeText));
  } catch {
    /* Validate on run. */
  }
  async function run() {
    if (!settings) return;
    const id = ++sequence.current;
    setBusy(true);
    setError('');
    setResult(undefined);
    try {
      const value = await rehearse(settings, amount(sizeText), index);
      if (id === sequence.current) {
        setResult({ key, value });
        if (!value.routeError) onReviewed(settingsKey(settings));
      }
    } catch (e) {
      if (id === sequence.current)
        setError(
          e instanceof Error ? e.message : 'Rehearsal unavailable. Retry.',
        );
    } finally {
      if (id === sequence.current) setBusy(false);
    }
  }
  return (
    <aside className="rehearsal-panel" aria-labelledby="rehearsal-title">
      <div className="rehearsal-heading">
        <span className="eyebrow">
          <FlaskConical size={16} aria-hidden="true" /> 02 / Rehearse
        </span>
        <span className="sample-label">Historical rehearsal</span>
      </div>
      <h2 id="rehearsal-title">
        Meet your policy
        <br />
        <span>under pressure.</span>
      </h2>
      <p className="rehearsal-lead">
        See what your allocation permits—and what protection gives up.
      </p>
      <fieldset className="rehearsal-scenarios">
        <legend className="sr-only">Historical checkpoint</legend>
        {names.map((name, i) => (
          <button
            type="button"
            key={name}
            aria-pressed={i === index}
            onClick={() => {
              setIndex(i);
              setError('');
            }}
          >
            <span>0{i + 1}</span>
            {name}
          </button>
        ))}
      </fieldset>
      <div className="rehearsal-controls">
        <label>
          Asset units in one attempted trade
          <input
            inputMode="decimal"
            value={sizeText}
            onChange={(e) => {
              setSizeInput(e.target.value);
              setError('');
            }}
            aria-invalid={!!error}
            aria-describedby={
              error
                ? 'rehearsal-size-help rehearsal-error'
                : 'rehearsal-size-help'
            }
          />
        </label>
        <button
          type="button"
          className="primary-action"
          disabled={!settings || busy}
          onClick={() => void run()}
        >
          {busy ? 'Reading archived pool…' : 'Rehearse these settings'}
          <ArrowUpRight size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="action-help" id="rehearsal-size-help">
        USDC / USDT history, applied to your numeric settings. Activation
        creates no-value bUSD / rUSD on Sepolia—not a real USDC position. No
        tokens move in rehearsal.
      </p>
      {error && (
        <p role="alert" id="rehearsal-error" className="notice error">
          {error}
        </p>
      )}
      {!settings && (
        <p className="notice">
          Enter valid allocations to explore your policy.
        </p>
      )}
      {!current && settings && (
        <div className="rehearsal-idle">
          <ShieldCheck size={28} aria-hidden="true" />
          <div>
            <h3>
              {result
                ? 'Settings changed. Rehearse again.'
                : 'One allocation. Three choices.'}
            </h3>
            <p>
              Compare your limits, the same trade without the acquisition guard,
              and a bounded direct sale.
            </p>
            {offered && (
              <p className="quote-teaser">
                Your healthy curve offers{' '}
                <strong>{fmt(offered.output)} reserve</strong> for {sizeText}{' '}
                asset units, including {fmt(offered.fee)} asset units of fee.
                Arithmetic only—not demand or a live quote.
              </p>
            )}
          </div>
        </div>
      )}
      <output className="sr-only">
        {busy
          ? 'Reading historical pool quotes.'
          : current
            ? `Rehearsal updated. Policy is ${current.state}. Compare the three outcomes below.`
            : ''}
      </output>
      {current && (
        <div className="rehearsal-results">
          <div className={`rehearsal-verdict ${current.state.toLowerCase()}`}>
            <div>
              <span className="eyebrow">
                {names[index]} ·{' '}
                {new Date(checkpoints[index].timestamp * 1000)
                  .toISOString()
                  .slice(0, 16)
                  .replace('T', ' ')}{' '}
                UTC
              </span>
              <h3>
                {current.state === 'Stressed'
                  ? 'Stop buying. Bounded sales only.'
                  : current.state === 'Halted'
                    ? 'Neither direction can trade.'
                    : 'Two-way trading is permitted.'}
              </h3>
            </div>
            <span className="rehearsal-state">{current.state}</span>
          </div>
          <div className="observation-strip">
            <span>
              Asset observation
              <strong>
                $
                {Number(formatUnits(current.observation.assetUsd, 18)).toFixed(
                  4,
                )}
              </strong>
            </span>
            <span>
              Reserve observation
              <strong>
                $
                {Number(
                  formatUnits(current.observation.reserveUsd, 18),
                ).toFixed(4)}
              </strong>
            </span>
            <span>
              Market mark
              <strong>
                {price(checkpoints[index].marketRatioE18)} reserve / asset
              </strong>
            </span>
          </div>
          {current.routeError && (
            <p role="alert" className="notice error">
              {current.routeError}
            </p>
          )}
          <div className="comparison-grid">
            {current.arms.map((arm, i) => (
              <section className={`comparison-arm arm-${i}`} key={titles[i]}>
                <span className="eyebrow">0{i + 1}</span>
                <h3>{titles[i]}</h3>
                <p className="arm-action">{arm.action}</p>
                <dl>
                  <div>
                    <dt>Asset inventory</dt>
                    <dd>{arm.known ? fmt(arm.asset) : 'Unknown'}</dd>
                  </div>
                  <div>
                    <dt>Reserve inventory</dt>
                    <dd>{arm.known ? fmt(arm.reserve) : 'Unknown'}</dd>
                  </div>
                  <div>
                    <dt>Retained asset fees</dt>
                    <dd>{arm.known ? fmt(arm.fee) : 'Unknown'}</dd>
                  </div>
                  <div>
                    <dt>Estimated owner gas · reserve</dt>
                    <dd>{arm.known ? fmt(arm.gas) : 'Unknown'}</dd>
                  </div>
                  <div className="arm-outcome">
                    <dt>Change at the same market mark · reserve</dt>
                    <dd className={arm.change < 0n ? 'negative' : ''}>
                      {arm.known ? signed(arm.change) : 'Unknown'}
                    </dd>
                  </div>
                  <div>
                    <dt>At hypothetical 1:1 recovery · reserve</dt>
                    <dd>{arm.known ? signed(arm.atParity) : 'Unknown'}</dd>
                  </div>
                </dl>
                {i === 2 && arm.action === 'Owner-funded bounded sale' && (
                  <p className="arm-alternative">
                    A cost-aware owner could cancel without selling instead:
                    estimated gas {fmt(current.cancelGas)} reserve, unchanged
                    token inventory. The sale above is not claimed to be the
                    optimal choice.
                  </p>
                )}
              </section>
            ))}
          </div>
          <div className="rehearsal-takeaway">
            <strong>Protection is a tradeoff, not a profit promise.</strong>
            <p>
              Your original asset allocation is already{' '}
              {fmt(
                current.originalExposure < 0n
                  ? -current.originalExposure
                  : current.originalExposure,
              )}{' '}
              reserve units {current.originalExposure < 0n ? 'above' : 'below'}{' '}
              parity at this market mark. Refusing a new purchase does not
              recover that exposure.
            </p>
            {current.offeredChange !== undefined && (
              <p>
                If the offered unguarded inflow settled, its incremental marked
                change would be{' '}
                <strong>{signed(current.offeredChange)} reserve</strong>.{' '}
                {current.takerNet !== undefined && current.takerNet <= 0n
                  ? 'This route does not cover modeled taker gas, so no inflow or fee is assumed above.'
                  : 'This is not a forecast of trading volume.'}
              </p>
            )}
          </div>
          <details className="rehearsal-method">
            <summary>Quotes, assumptions and limitations</summary>
            <p>
              Each checkpoint starts independently with your allocation, fully
              backed and approved. One hypothetical trade—not continuous order
              flow, total returns, or a current executable quote. Unequal
              allocations can price the healthy curve away from parity.
            </p>
            <p>
              Archived Uniswap V3 fee-500 quotes include size-dependent price
              impact.{' '}
              {current.externalSale !== undefined
                ? `Selling ${sizeText} asset quoted ${fmt(current.externalSale)} reserve.`
                : ''}{' '}
              {current.floor !== undefined
                ? `Your gross exit floor is ${fmt(current.floor)} reserve.`
                : ''}{' '}
              Unknown quotes stay unknown; no spot-price fallback.
            </p>
            <p>
              Estimated gas: 600,000 units for taker acquisition plus fill,
              450,000 for direct exit, 100,000 for cancellation; each gets 20%
              headroom at historical base fee plus 2 gwei. Historical ETH/USD
              and reserve/USD value the gas. These are assumptions—not measured
              costs for your settings. Common setup costs excluded.
            </p>
            <p>
              The direct alternative assumes an already authorized, immediate
              owner-funded cancellation and sale meeting the same gross floor.
              Gas is paid separately, even when the sale loses value after gas.
              This is a comparator, not a new wallet action or a recommendation.
              No compensated keeper is assumed. Healthy checkpoints retain the
              same fee-bearing policy. Unguarded removes only acquisition
              protection, not observation validity or reserve safety.
            </p>
            <p>
              Fees are already included in inventory. Hypothetical parity holds
              post-action balances and owner gas constant; no future sale is
              assumed. Observation ages: asset {current.observation.assetAge}s /
              reserve {current.observation.reserveAge}s. Accepted data can lag
              markets. Only four predeclared March2023 checkpoints are tested.
            </p>
            <a
              href={`https://etherscan.io/block/${checkpoints[index].block}`}
              target="_blank"
              rel="noreferrer"
            >
              Block {checkpoints[index].block} ↗
            </a>
            {' · '}
            <a
              href="https://github.com/qdeeworld/breakwater/blob/main/docs/guard-benefit.md"
              target="_blank"
              rel="noreferrer"
            >
              Original matched study ↗
            </a>
          </details>
        </div>
      )}
    </aside>
  );
}
