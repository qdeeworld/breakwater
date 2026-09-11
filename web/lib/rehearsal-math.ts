// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
// Derived material copyright (c) 2025 Degensoft Ltd; translated September 11, 2026.
// BigInt port of pinned SwapVM PeggedSwapMath/PeggedSwap/Fee rounding.
// Counterfactual arithmetic only: not a quote, execution or return forecast.
export const UNIT = 1_000_000n;
export const USD = 10n ** 18n;
const ONE = 10n ** 27n;
const WIDTH = 100n * ONE;
export type Settings = {
  assetAllocation: bigint;
  reserveAllocation: bigint;
  feeBps: number;
  trigger: bigint;
  discountBps: number;
  assetMaxAge: number;
  reserveMaxAge: number;
};
export type Observation = {
  assetUsd: bigint;
  reserveUsd: bigint;
  assetAge: number;
  reserveAge: number;
};
export const ceil = (a: bigint, b: bigint) => (a + b - 1n) / b;
export function amount(value: string): bigint {
  if (!/^\d{1,13}(\.\d{1,6})?$/.test(value))
    throw new Error('Use positive amounts with at most six decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const n = BigInt(whole) * UNIT + BigInt(fraction.padEnd(6, '0'));
  if (n <= 0n || n > 1_000_000_000_000n * UNIT)
    throw new Error('Choose an amount between 0.000001 and 1 trillion tokens.');
  return n;
}
export function settingsFromForm(
  asset: string,
  reserve: string,
  fee: string,
  trigger: string,
  discount: string,
): Settings {
  if (
    !['10', '30', '100'].includes(fee) ||
    !['98', '99'].includes(trigger) ||
    !['0', '25', '50', '100'].includes(discount)
  )
    throw new Error('Choose one of the supported policy settings.');
  return {
    assetAllocation: amount(asset),
    reserveAllocation: amount(reserve),
    feeBps: Number(fee),
    trigger: BigInt(trigger) * 10n ** 16n,
    discountBps: Number(discount),
    assetMaxAge: 86400,
    reserveMaxAge: 90000,
  };
}
export const settingsKey = (s: Settings) =>
  [
    s.assetAllocation,
    s.reserveAllocation,
    s.feeBps,
    s.trigger,
    s.discountBps,
    s.assetMaxAge,
    s.reserveMaxAge,
  ].join(':');
export function sqrt(n: bigint): bigint {
  if (n < 0n) throw new Error('Negative square root');
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  let next = (x + n / x) / 2n;
  while (next < x) {
    x = next;
    next = (x + n / x) / 2n;
  }
  return x;
}
function solve(u: bigint, c: bigint): bigint {
  const used = sqrt(u * ONE) + (WIDTH * u) / ONE;
  if (used > c) throw new Error('Trade exceeds the curve’s available range.');
  const right = c - used,
    disc = (ONE + (4n * WIDTH * right) / ONE) * ONE;
  const root = sqrt(disc),
    roundedRoot = root * root === disc ? root : root + 1n;
  const w = (2n * right * ONE) / (ONE + roundedRoot);
  return (w * w) / ONE;
}
// New, fully backed position; equal six-decimal token precision; exact asset input.
export function healthyQuote(s: Settings, gross: bigint) {
  const fee = ceil(gross * BigInt(s.feeBps), 10_000n),
    net = gross - fee;
  const x = s.assetAllocation,
    y = s.reserveAllocation;
  const invariant = 2n * ONE + 2n * WIDTH;
  const v = solve(((x + net) * ONE) / x, invariant);
  // Match normalization to 18 decimals before final truncation to token units.
  const yAfterNormalized = ceil(v * y * 10n ** 12n, ONE);
  const output = (y * 10n ** 12n - yAfterNormalized) / 10n ** 12n;
  if (output <= 0n || output > y)
    throw new Error('This trade has no positive backed output.');
  return { output, fee };
}
export function policyState(
  s: Settings,
  o: Observation,
): 'Healthy' | 'Stressed' | 'Halted' {
  if (
    o.assetUsd <= 0n ||
    o.reserveUsd <= 0n ||
    o.assetAge < 0 ||
    o.reserveAge < 0 ||
    o.assetAge > s.assetMaxAge ||
    o.reserveAge > s.reserveMaxAge ||
    o.reserveUsd < (98n * USD) / 100n ||
    o.reserveUsd > (102n * USD) / 100n ||
    o.assetUsd > (102n * USD) / 100n
  )
    return 'Halted';
  return o.assetUsd >= s.trigger &&
    (o.assetUsd * USD) / o.reserveUsd >= s.trigger
    ? 'Healthy'
    : 'Stressed';
}
export function exitFloor(s: Settings, o: Observation, size: bigint) {
  if (
    policyState(s, o) !== 'Stressed' ||
    size > s.assetAllocation ||
    size <= 0n
  )
    return undefined;
  const price = ceil(
    ceil(o.assetUsd * USD, o.reserveUsd) * BigInt(10_000 - s.discountBps),
    10_000n,
  );
  return ceil(size * price, USD);
}
export const marked = (asset: bigint, reserve: bigint, mark: bigint) =>
  (asset * mark) / USD + reserve;

export type HistoryPoint = {
  assetUsd: string;
  reserveUsd: string;
  assetAge: number;
  reserveAge: number;
  marketRatioE18: string;
  gasPriceWei: string;
  ethUsd: string;
};
export type Routes = { acquisitionCost?: bigint; externalSale?: bigint };
export type Arm = {
  action: string;
  known: boolean;
  asset: bigint;
  reserve: bigint;
  fee: bigint;
  gas: bigint;
  change: bigint;
  atParity: bigint;
};
export function calculateRehearsal(
  s: Settings,
  size: bigint,
  h: HistoryPoint,
  routes: Routes,
) {
  if (size <= 0n || size > s.assetAllocation)
    throw new Error('Test a trade no larger than the asset allocation.');
  const observation = {
    assetUsd: BigInt(h.assetUsd),
    reserveUsd: BigInt(h.reserveUsd),
    assetAge: h.assetAge,
    reserveAge: h.reserveAge,
  };
  const state = policyState(s, observation),
    mark = BigInt(h.marketRatioE18);
  const base = marked(s.assetAllocation, s.reserveAllocation, mark);
  const gas = (units: bigint) =>
    ceil(
      ceil(units * 120n, 100n) *
        BigInt(h.gasPriceWei) *
        BigInt(h.ethUsd) *
        UNIT,
      USD * observation.reserveUsd,
    );
  const arm = (
    action: string,
    a = s.assetAllocation,
    r = s.reserveAllocation,
    fee = 0n,
    cost = 0n,
    known = true,
  ): Arm => ({
    action,
    known,
    asset: a,
    reserve: r,
    fee,
    gas: cost,
    change: marked(a, r, mark) - base - cost,
    atParity: a + r - s.assetAllocation - s.reserveAllocation - cost,
  });
  let offeredOutput: bigint | undefined,
    offeredFee: bigint | undefined,
    offeredChange: bigint | undefined,
    quoteError: string | undefined;
  try {
    const q = healthyQuote(s, size);
    offeredOutput = q.output;
    offeredFee = q.fee;
    offeredChange =
      marked(s.assetAllocation + size, s.reserveAllocation - q.output, mark) -
      base;
  } catch (e) {
    quoteError = e instanceof Error ? e.message : 'No backed curve output.';
  }
  const takerNet =
    offeredOutput !== undefined && routes.acquisitionCost !== undefined
      ? offeredOutput - routes.acquisitionCost - gas(600_000n)
      : undefined;
  const fillable = takerNet !== undefined && takerNet > 0n;
  const offered = () =>
    arm(
      'Screened inflow',
      s.assetAllocation + size,
      s.reserveAllocation - offeredOutput!,
      offeredFee,
    );
  const noFill = () =>
    quoteError
      ? arm('Outside curve range')
      : routes.acquisitionCost === undefined
        ? arm('Inflow quote unavailable', undefined, undefined, 0n, 0n, false)
        : arm('No gas-covering inflow');
  const arms: Arm[] = [
    state === 'Healthy'
      ? fillable
        ? offered()
        : noFill()
      : arm(
          state === 'Stressed' ? 'Impaired inflow refused' : 'Trading halted',
        ),
  ];
  arms.push(
    state === 'Halted'
      ? arm('Trading halted')
      : fillable
        ? offered()
        : noFill(),
  );
  const floor = exitFloor(s, observation, size);
  if (state === 'Healthy') arms.push(fillable ? offered() : noFill());
  else if (state === 'Halted')
    arms.push(
      arm(
        'Cancel; unsafe observations',
        undefined,
        undefined,
        0n,
        gas(100_000n),
      ),
    );
  else if (routes.externalSale === undefined)
    arms.push(
      arm('Exit quote unavailable', undefined, undefined, 0n, 0n, false),
    );
  else if (floor !== undefined && routes.externalSale >= floor)
    arms.push(
      arm(
        'Owner-funded bounded sale',
        s.assetAllocation - size,
        s.reserveAllocation + routes.externalSale,
        0n,
        gas(450_000n),
      ),
    );
  else
    arms.push(
      arm('Cancel; sale below floor', undefined, undefined, 0n, gas(100_000n)),
    );
  return {
    size,
    cancelGas: gas(100_000n),
    state,
    arms,
    observation,
    originalExposure: (s.assetAllocation * (USD - mark)) / USD,
    offeredOutput,
    offeredFee,
    offeredChange,
    quoteError,
    takerNet,
    floor,
    ...routes,
  };
}
