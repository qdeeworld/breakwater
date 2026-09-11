import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { encodeErrorResult } from 'viem';
import { policyError, policyErrorAbi } from '../lib/policy-error.ts';

const unsafe = 'Reserve outside $0.98–$1.02. Both trade directions are halted.';
const fallback =
  'Policy data is unavailable or invalid. Trading is halted; retry the onchain read.';
// Actual Sepolia co-depeg revert, block 11682604; not a transaction fixture.
const revert =
  '0x240cedde0000000000000000000000000000000000000000000000000d0b8d0508de0000';

test('decodes unsafe reserve through RPC and viem wrappers', () => {
  for (const error of [
    { cause: { data: { errorName: 'UnsafeReserve' } } },
    { message: 'Execution reverted', cause: { cause: { data: revert } } },
    { data: { originalError: { data: revert } } },
    vm.runInNewContext('new Error("UnsafeReserve")'),
    revert,
  ])
    assert.equal(policyError(error), unsafe);
});

test('decodes expired observations without substituting a reserve diagnosis', () => {
  const data = encodeErrorResult({
    abi: policyErrorAbi,
    errorName: 'StaleFeed',
    args: ['0x0000000000000000000000000000000000000001', 1n, 100000n, 86400n],
  });
  assert.match(policyError({ cause: { data } }), /exceeded its age limit/);
});

test('handles supported textual errors and never exposes raw RPC details', () => {
  assert.match(
    policyError(new Error('ToxicDirectionBlocked')),
    /add impaired inventory/,
  );
  assert.match(
    policyError({ shortMessage: 'UnsupportedAssetPremium' }),
    /Asset above/,
  );
  assert.match(
    policyError({ cause: { message: 'InsufficientBadTokenLiquidity' } }),
    /Reduce the amount/,
  );
  assert.match(
    policyError({ data: { errorName: 'OracleCommitmentMismatch' } }),
    /Refresh the quote/,
  );
  for (const e of [
    undefined,
    null,
    '0xdeadbeef',
    { message: 'Network error' },
    { data: { errorName: 'constructor' } },
    'NotUnsafeReserve',
  ])
    assert.equal(policyError(e), fallback);
});

test('bounds cyclic or deeply wrapped unknown errors', () => {
  const cycle = {};
  cycle.cause = cycle;
  assert.equal(policyError(cycle), fallback);
  let deep = { data: revert };
  for (let i = 0; i < 20; i++) deep = { cause: deep };
  assert.equal(policyError(deep), fallback);
});
