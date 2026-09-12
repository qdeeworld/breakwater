import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionRoute } from '../lib/position-route.ts';

const hash = `0x${'a1'.repeat(32)}`;
test('plain root is marketing, with a distinct creation key', () => {
  assert.deepEqual(positionRoute({}), {
    hasPosition: false,
    key: 'create',
    initialPosition: undefined,
    initialPositionError: '',
  });
});
test('shared links carry validated position identity for the first server render', () => {
  assert.deepEqual(positionRoute({ position: hash }), {
    hasPosition: true,
    key: `position:${hash}`,
    initialPosition: hash,
    initialPositionError: '',
  });
});
test('empty and malformed links stay in console with a useful error', () => {
  for (const value of [
    '',
    'invalid',
    'create',
    '0xabc',
    `0x${'z'.repeat(64)}`,
  ]) {
    const route = positionRoute({ position: value });
    assert.equal(route.hasPosition, true);
    assert.equal(route.initialPosition, undefined);
    assert.match(route.initialPositionError, /link is invalid/);
    assert.notEqual(route.key, 'create');
  }
});
test('repeated values match URLSearchParams first-value behavior', () => {
  assert.equal(
    positionRoute({ position: [hash, 'invalid'] }).initialPosition,
    hash,
  );
  assert.equal(
    positionRoute({ position: ['', hash] }).initialPosition,
    undefined,
  );
});
test('different positions and creation use collision-free component keys', () => {
  assert.notEqual(
    positionRoute({ position: hash }).key,
    positionRoute({ position: `0x${'b2'.repeat(32)}` }).key,
  );
  assert.notEqual(
    positionRoute({ position: 'create' }).key,
    positionRoute({}).key,
  );
});
