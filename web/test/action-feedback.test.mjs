import test from 'node:test';
import assert from 'node:assert/strict';
import { actionHeading } from '../lib/action-feedback.ts';

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
