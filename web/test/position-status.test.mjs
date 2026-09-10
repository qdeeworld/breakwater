import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveryRanges, positionStatus } from '../lib/position-status.ts';

const healthy = {
  cancelled: false,
  shipped: true,
  healthy: true,
  policyError: '',
  assetAvailable: 1n,
  reserveAvailable: 1n,
};
test('cancelled and unshipped positions never advertise trading', () => {
  assert.equal(positionStatus({ ...healthy, cancelled: true }).tradable, false);
  assert.equal(positionStatus({ ...healthy, shipped: false }).tradable, false);
});
test('invalid/stale observations halt even when backing exists', () => {
  assert.equal(
    positionStatus({ ...healthy, healthy: undefined, policyError: 'stale' })
      .reason,
    'stale',
  );
  assert.equal(
    positionStatus({ ...healthy, healthy: undefined }).tradable,
    false,
  );
});
test('stressed positions need impaired output, not reserve output', () => {
  assert.equal(
    positionStatus({ ...healthy, healthy: false, assetAvailable: 0n }).tradable,
    false,
  );
  assert.equal(
    positionStatus({ ...healthy, healthy: false, reserveAvailable: 0n }).label,
    'Exit only',
  );
});
test('healthy direction remains potentially available with one backed output', () => {
  assert.equal(
    positionStatus({ ...healthy, assetAvailable: 0n }).tradable,
    true,
  );
  assert.equal(
    positionStatus({ ...healthy, assetAvailable: 0n, reserveAvailable: 0n })
      .tradable,
    false,
  );
});
test('event scan is bounded, contiguous and never predates deployment', () => {
  const ranges = discoveryRanges(50000n, 1n);
  assert.equal(ranges.length, 20);
  assert.equal(ranges[0].toBlock, 50000n);
  assert.equal(ranges.at(-1).fromBlock, 30001n);
  for (let i = 1; i < ranges.length; i++)
    assert.equal(ranges[i].toBlock, ranges[i - 1].fromBlock - 1n);
  assert.deepEqual(discoveryRanges(20n, 10n), [
    { fromBlock: 10n, toBlock: 20n },
  ]);
  assert.deepEqual(discoveryRanges(9n, 10n), []);
});
