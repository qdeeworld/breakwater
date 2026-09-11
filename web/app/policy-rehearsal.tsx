'use client';
import { useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { ArrowRight, ShieldCheck } from 'lucide-react';
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
  'Without the buying guard',
  'Cancel / direct sale',
];
const explanations: Record<string, string> = {
  'Impaired inflow refused':
    'Buying the impaired asset is blocked. No additional asset is accumulated.',
  'Trading halted': 'Neither direction may trade with these observations.',
  'Screened inflow':
    'The modeled trader covers its assumed gas cost, so this one inflow is counted.',
  'No gas-covering inflow':
    'The modeled trader cannot cover its gas cost. No inflow or earned fee is assumed.',
  'Outside curve range':
    'This trade size is outside the curve’s range. No fill is assumed.',
  'Inflow quote unavailable':
    'The archived acquisition quote is unavailable. This outcome is unknown.',
  'Exit quote unavailable':
    'The archived sale quote is unavailable. Exit proceeds remain unknown.',
  'Owner-funded bounded sale':
    'The external sale meets the gross price floor. The owner pays estimated gas separately.',
  'Cancel; sale below floor':
    'The external sale misses the gross price floor. The alternative cancels without selling.',
  'Cancel; unsafe observations':
    'Unsafe observations prevent a sale. The alternative cancels without selling.',
};
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
        <h2 id="rehearsal-title">Test your policy</h2>
        <span className="sample-label">Historical rehearsal</span>
      </div>
      <p className="rehearsal-lead">
        Independent historical snapshots. Each starts with your allocation—not a
        continuous backtest.
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
            {name}
          </button>
        ))}
      </fieldset>
      <div className="rehearsal-controls">
        <label>
          Asset units in one test trade
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
          <ArrowRight size={18} aria-hidden="true" />
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
                : 'What would these limits permit?'}
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
              <p className="checkpoint-date">
                {names[index]} ·{' '}
                {new Date(checkpoints[index].timestamp * 1000)
                  .toISOString()
                  .slice(0, 16)
                  .replace('T', ' ')}{' '}
                UTC
              </p>
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
          <div className="rehearsal-outcomes">
            {current.arms.map((arm, i) => (
              <div key={titles[i]}>
                <h4>{titles[i]}</h4>
                <p>{explanations[arm.action] ?? arm.action}</p>
              </div>
            ))}
          </div>
          <p className="exposure-summary">
            <strong>Your existing exposure remains.</strong> The starting asset
            allocation is{' '}
            {fmt(
              current.originalExposure < 0n
                ? -current.originalExposure
                : current.originalExposure,
            )}{' '}
            reserve units {current.originalExposure < 0n ? 'above' : 'below'}{' '}
            parity at this market price. Refusing another purchase does not
            recover it.
          </p>
          {current.routeError && (
            <p role="alert" className="notice error">
              {current.routeError}
            </p>
          )}
          <details className="rehearsal-comparison">
            <summary>Compare balances, costs and recovery tradeoffs</summary>
            <div className="observation-strip">
              <span>
                Asset observation
                <strong>
                  $
                  {Number(
                    formatUnits(current.observation.assetUsd, 18),
                  ).toFixed(4)}
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
            {/* Keyboard users need to scroll the wide comparison at narrow widths. */}
            {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex */}
            <section
              className="comparison-table-wrap"
              aria-label="Exact historical comparison"
              tabIndex={0}
            >
              {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
              <table className="comparison-table">
                <caption>
                  One hypothetical trade. Exact token amounts; fees are already
                  included in inventory.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Outcome</th>
                    {titles.map((title) => (
                      <th scope="col" key={title}>
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Action</th>
                    {current.arms.map((a, i) => (
                      <td key={i}>{a.action}</td>
                    ))}
                  </tr>
                  {(
                    [
                      ['Asset inventory', 'asset'],
                      ['Reserve inventory', 'reserve'],
                      ['Retained asset fees', 'fee'],
                      ['Estimated owner gas · reserve', 'gas'],
                      ['Change at the same market price · reserve', 'change'],
                      [
                        'Change at hypothetical 1:1 recovery · reserve',
                        'atParity',
                      ],
                    ] as const
                  ).map(([label, field]) => (
                    <tr key={field}>
                      <th scope="row">{label}</th>
                      {current.arms.map((a, i) => (
                        <td
                          key={i}
                          className={
                            a.known &&
                            (field === 'change' || field === 'atParity') &&
                            a[field] < 0n
                              ? 'negative'
                              : ''
                          }
                        >
                          {a.known
                            ? field === 'change' || field === 'atParity'
                              ? signed(a[field])
                              : fmt(a[field])
                            : 'Unknown'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            {current.arms[2].action === 'Owner-funded bounded sale' && (
              <p className="arm-alternative">
                A cost-aware owner could cancel without selling instead:
                estimated gas {fmt(current.cancelGas)} reserve, unchanged token
                inventory. The sale is not claimed to be the optimal choice.
              </p>
            )}
            <div className="rehearsal-takeaway">
              <strong>Protection is a tradeoff, not a profit promise.</strong>
              {current.offeredChange !== undefined && (
                <p>
                  If the offered unguarded inflow settled, its incremental
                  marked change would be{' '}
                  <strong>{signed(current.offeredChange)} reserve</strong>.{' '}
                  {current.takerNet !== undefined && current.takerNet <= 0n
                    ? 'This route does not cover modeled taker gas, so no inflow or fee is assumed above.'
                    : 'This is not a forecast of trading volume.'}
                </p>
              )}
            </div>
          </details>
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
              markets. Only four predeclared March 2023 checkpoints are tested.
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
