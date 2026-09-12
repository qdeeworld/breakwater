import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observationAge } from '../lib/observation-age.ts';

test('does not claim a fresh age before the client clock is ready', () => {
  assert.equal(observationAge(100, 0), 'Calculating age…');
});
test('future observations are not described as newly received', () => {
  assert.equal(observationAge(101, 100), 'Future timestamp');
});
test('formats seconds, minutes and hours without rounding away an age limit', () => {
  assert.equal(observationAge(100, 159), '59s ago');
  assert.equal(observationAge(100, 160), '1m ago');
  assert.equal(observationAge(100, 3700), '1h ago');
  assert.equal(observationAge(100, 61909), '17h 10m ago');
  assert.equal(observationAge(100, 86500), '24h ago');
});
