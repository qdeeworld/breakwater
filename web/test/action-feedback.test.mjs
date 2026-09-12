import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionHeading,
  feedbackPlacement,
  feedbackContextLabel,
} from '../lib/action-feedback.ts';

test('wallet review is distinct from broadcast and confirmation', () => {
  assert.equal(
    actionHeading('idle', 'Preparing trade', false, ''),
    'Preparing trade',
  );
  assert.equal(
    actionHeading('wallet', 'Preparing trade', false, ''),
    'Confirm in your wallet',
  );
  assert.equal(
    actionHeading('confirming', 'Preparing trade', true, ''),
    'Waiting for confirmation',
  );
  assert.equal(
    actionHeading('confirmed', '', false, ''),
    'Transaction confirmed',
  );
});
test('an unresolved or failed action never presents as confirmed', () => {
  assert.equal(
    actionHeading('confirmed', '', true, ''),
    'Confirmation unresolved',
  );
  assert.equal(
    actionHeading('confirming', 'Preparing trade', true, 'Timed out'),
    'Confirmation unresolved',
  );
  assert.equal(
    actionHeading('wallet', '', false, 'User rejected'),
    'Action not completed',
  );
});

test('a post-confirmation read failure does not imply the transaction failed', () => {
  assert.equal(
    actionHeading('confirmed', '', false, 'Position list unavailable'),
    'Confirmed — follow-up needs attention',
  );
});

const originalWallet = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const otherWallet = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const originalOrder = `0x${'1'.repeat(64)}`;
const otherOrder = `0x${'2'.repeat(64)}`;

for (const area of ['create', 'position', 'faucet']) {
  test(`${area} feedback stays local only for its original wallet`, () => {
    const state = {
      area,
      showCreate: area === 'create',
      positionHash: originalOrder,
      context: { account: originalWallet, order: originalOrder },
    };
    assert.equal(feedbackPlacement({ ...state, account: originalWallet }), area);
    assert.equal(feedbackPlacement({ ...state, account: originalWallet.toUpperCase() }), area);
    assert.equal(feedbackPlacement({ ...state, account: otherWallet }), 'global');
    assert.equal(feedbackPlacement({ ...state, account: undefined }), 'global');
  });
}

test('position feedback moves globally when selecting another position', () => {
  assert.equal(feedbackPlacement({
    area: 'position', showCreate: false, positionHash: otherOrder,
    account: originalWallet, context: { account: originalWallet, order: originalOrder },
  }), 'global');
});

test('wallet-only and pre-broadcast feedback retain context without a receipt', () => {
  assert.equal(feedbackContextLabel({ account: originalWallet }), 'For wallet 0xaaaaaa…aaaa');
  assert.equal(feedbackContextLabel({ account: originalWallet, order: originalOrder }),
    'For position 0x111111…1111 · wallet 0xaaaaaa…aaaa');
  assert.equal(feedbackContextLabel({}), undefined);
});
