import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { completePoolQuote } from '../lib/rehearsal-quote.ts';
import {
  amount,
  settingsFromForm,
  settingsKey,
  healthyQuote,
  policyState,
  exitFloor,
  calculateRehearsal,
  USD,
} from '../lib/rehearsal-math.ts';
const s = settingsFromForm('100000', '100000', '30', '98', '50');
test('pool limits and zero output cannot masquerade as complete execution', () => {
  assert.equal(completePoolQuote(1n, 2n ** 96n), true);
  assert.equal(completePoolQuote(0n, 2n ** 96n), false);
  assert.equal(completePoolQuote(1n, 4295128740n), false);
  assert.equal(
    completePoolQuote(1n, 1461446703485210103287273052203988822378723970341n),
    false,
  );
});
const history = JSON.parse(
  readFileSync(
    new URL('../lib/rehearsal-history.json', import.meta.url),
    'utf8',
  ),
);
test('exact benchmark curve and fee, not linear scaling', () => {
  assert.deepEqual(healthyQuote(s, amount('10000')), {
    output: 9967520284n,
    fee: 30000000n,
  });
  assert.notEqual(
    healthyQuote(s, amount('10000')).output,
    healthyQuote(s, amount('1000')).output * 10n,
  );
  assert.notEqual(
    healthyQuote({ ...s, reserveAllocation: amount('50000') }, amount('1000'))
      .output,
    healthyQuote(s, amount('1000')).output,
  );
});
test('strict decimal input and supported policies', () => {
  for (const v of [
    '',
    '0',
    '-1',
    '1e6',
    'Infinity',
    'NaN',
    '1.0000001',
    '1000000000001',
  ])
    assert.throws(() => amount(v));
  assert.equal(amount('0.000001'), 1n);
  assert.throws(() => settingsFromForm('100', '100', '0', '98', '50'));
  assert.throws(() => calculateRehearsal(s, amount('100001'), history[1], {}));
});
test('every activated field participates in settings identity', () => {
  for (const [k, v] of Object.entries(s))
    assert.notEqual(
      settingsKey(s),
      settingsKey({ ...s, [k]: typeof v === 'bigint' ? v + 1n : v + 1 }),
    );
  assert.equal(
    settingsKey(s),
    settingsKey(settingsFromForm('100000.0', '100000', '30', '98', '50')),
  );
});
test('independent USD safety and exact age/trigger boundaries', () => {
  const o = {
    assetUsd: USD,
    reserveUsd: USD,
    assetAge: 86400,
    reserveAge: 90000,
  };
  assert.equal(policyState(s, o), 'Healthy');
  assert.equal(policyState(s, { ...o, assetAge: 86401 }), 'Halted');
  assert.equal(policyState(s, { ...o, reserveAge: 90001 }), 'Halted');
  assert.equal(
    policyState(s, { ...o, assetUsd: (98n * USD) / 100n }),
    'Healthy',
  );
  assert.equal(
    policyState(s, { ...o, assetUsd: (98n * USD) / 100n - 1n }),
    'Stressed',
  );
  assert.equal(
    policyState(s, { ...o, reserveUsd: (94n * USD) / 100n }),
    'Halted',
  );
  assert.equal(
    policyState(s, {
      ...o,
      assetUsd: (94n * USD) / 100n,
      reserveUsd: (94n * USD) / 100n,
    }),
    'Halted',
  );
  assert.equal(
    policyState(s, { ...o, assetUsd: (102n * USD) / 100n + 1n }),
    'Halted',
  );
});
test('direct sale remains known when acquisition quote fails', () => {
  const r = calculateRehearsal(s, amount('10000'), history[1], {
    externalSale: 9406566736n,
  });
  assert.equal(r.arms[0].action, 'Impaired inflow refused');
  assert.equal(r.arms[1].known, false);
  assert.equal(r.arms[2].action, 'Owner-funded bounded sale');
  assert.equal(r.arms[2].known, true);
  assert.equal(r.arms[2].asset, amount('90000'));
  assert.ok(r.arms[2].gas > 0n);
});
test('unknown exit is not a claimed zero-cost successful hold', () => {
  const r = calculateRehearsal(s, amount('10000'), history[1], {});
  assert.equal(r.arms[2].known, false);
  assert.equal(r.arms[1].known, false);
});
test('fees included in balances; recovery opportunity cost and direct loss visible', () => {
  const r = calculateRehearsal(s, amount('10000'), history[1], {
    acquisitionCost: 9_000_000_000n,
    externalSale: 9406566736n,
  });
  assert.equal(r.arms[1].fee, 30_000_000n);
  assert.equal(r.arms[1].atParity, 32_479_716n);
  assert.equal(r.arms[1].change, -555_907_909n);
  assert.ok(r.arms[2].atParity < 0n);
  assert.equal(r.arms[0].asset, s.assetAllocation);
  assert.ok(r.originalExposure > 0n);
});
test('selected fee, trigger and discount change results', () => {
  const o = {
    assetUsd: 989915890000000000n,
    reserveUsd: 1004648550000000000n,
    assetAge: 2000,
    reserveAge: 23600,
  };
  assert.equal(policyState(s, o), 'Healthy');
  assert.equal(
    policyState({ ...s, trigger: (99n * USD) / 100n }, o),
    'Stressed',
  );
  // Synthetic quote between the two floors: tests policy sensitivity, not history.
  const low = calculateRehearsal(
    { ...s, discountBps: 0 },
    amount('10000'),
    history[1],
    { externalSale: 9375000000n },
  );
  assert.equal(low.arms[2].action, 'Cancel; sale below floor');
  assert.equal(
    calculateRehearsal(s, amount('10000'), history[1], {
      externalSale: 9375000000n,
    }).arms[2].action,
    'Owner-funded bounded sale',
  );
  assert.ok(
    healthyQuote({ ...s, feeBps: 100 }, amount('10000')).output <
      healthyQuote(s, amount('10000')).output,
  );
  assert.equal(
    exitFloor(s, { ...o, reserveUsd: 940000000000000000n }, 1n),
    undefined,
  );
});
