import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureAllocationAllowance } from '../lib/allocation-approval.ts';

for (const [name, current, required, expected] of [
  ['preserves original market unlimited approval', (1n << 256n) - 1n, 100n, []],
  ['preserves another position larger allowance', 1000000n, 100n, []],
  ['skips an equal allowance', 100n, 100n, []],
  [
    'raises insufficient allowance to the requested allocation',
    50n,
    100n,
    [100n],
  ],
  ['approves a new allocation', 0n, 100n, [100n]],
]) {
  test(name, async () => {
    const writes = [];
    let reads = 0;
    const changed = await ensureAllocationAllowance(
      required,
      async () => {
        reads++;
        return current;
      },
      async (value) => writes.push(value),
    );
    assert.equal(reads, 1);
    assert.deepEqual(writes, expected);
    assert.equal(changed, expected.length > 0);
  });
}

test('fails closed when the current allowance cannot be read', async () => {
  let wrote = false;
  await assert.rejects(
    ensureAllocationAllowance(
      100n,
      async () => {
        throw new Error('RPC unavailable');
      },
      async () => {
        wrote = true;
      },
    ),
    /RPC unavailable/,
  );
  assert.equal(wrote, false);
});

test('propagates wallet rejection without reporting approval', async () => {
  await assert.rejects(
    ensureAllocationAllowance(
      100n,
      async () => 0n,
      async () => {
        throw new Error('User rejected');
      },
    ),
    /User rejected/,
  );
});
