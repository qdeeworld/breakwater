import assert from 'node:assert/strict';
import { test } from 'node:test';
import { switchToSepolia } from '../lib/wallet-network.ts';

function wallet({
  chain = '0x1',
  switchError,
  addSelects = false,
  noSwitch = false,
  addError,
} = {}) {
  const calls = [];
  let attempts = 0;
  return {
    calls,
    request: async (request) => {
      calls.push(request);
      if (request.method === 'eth_chainId') return chain;
      if (request.method === 'wallet_switchEthereumChain') {
        if (attempts++ === 0 && switchError) throw switchError;
        if (!noSwitch) chain = '0xaa36a7';
      }
      if (request.method === 'wallet_addEthereumChain') {
        if (addError) throw addError;
        if (addSelects) chain = '0xaa36a7';
      }
      return null;
    },
  };
}

test('already on Sepolia: no network prompts', async () => {
  const p = wallet({ chain: '0xaa36a7' });
  assert.equal(await switchToSepolia(p), 11155111);
  assert.equal(p.calls.length, 1);
});
test('switches an existing network and verifies actual chain', async () => {
  const p = wallet();
  assert.equal(await switchToSepolia(p), 11155111);
  assert.deepEqual(
    p.calls.map((c) => c.method),
    ['eth_chainId', 'wallet_switchEthereumChain', 'eth_chainId'],
  );
});
for (const error of [
  { code: 4902 },
  { code: -32603, data: { originalError: { code: 4902 } } },
]) {
  test(`adds missing network and explicitly switches: ${JSON.stringify(error)}`, async () => {
    const p = wallet({ switchError: error });
    assert.equal(await switchToSepolia(p), 11155111);
    const added = p.calls.find((c) => c.method === 'wallet_addEthereumChain')
      .params[0];
    assert.equal(added.chainId, '0xaa36a7');
    assert.equal(added.nativeCurrency.symbol, 'ETH');
    assert.ok(added.rpcUrls.every((u) => u.startsWith('https://')));
    assert.equal(
      p.calls.filter((c) => c.method === 'wallet_switchEthereumChain').length,
      2,
    );
  });
}
test('does not prompt twice if adding also selects Sepolia', async () => {
  const p = wallet({ switchError: { code: 4902 }, addSelects: true });
  await switchToSepolia(p);
  assert.equal(
    p.calls.filter((c) => c.method === 'wallet_switchEthereumChain').length,
    1,
  );
});
for (const [code, text] of [
  [4001, /declined/],
  [-32002, /already pending/],
  [4200, /cannot switch/],
  [-32601, /cannot switch/],
]) {
  test(`actionable error ${code}, no add request`, async () => {
    const p = wallet({ switchError: { code } });
    await assert.rejects(switchToSepolia(p), text);
    assert.equal(
      p.calls.some((c) => c.method === 'wallet_addEthereumChain'),
      false,
    );
  });
}
test('add rejection never proceeds to a second switch', async () => {
  const p = wallet({ switchError: { code: 4902 }, addError: { code: 4001 } });
  await assert.rejects(switchToSepolia(p), /declined/);
  assert.equal(
    p.calls.filter((c) => c.method === 'wallet_switchEthereumChain').length,
    1,
  );
});
test('resolved request cannot falsely mark an unchanged chain as Sepolia', async () => {
  await assert.rejects(
    switchToSepolia(wallet({ noSwitch: true })),
    /still on another network/,
  );
});
