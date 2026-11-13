import test from 'node:test';
import assert from 'node:assert/strict';
import {createReplayScaleLock} from '../frontend/src/replay/replay-scale-lock.ts';

test('playback holds raw price bounds until an explicit reset', () => {
  const lock = createReplayScaleLock();
  const original = {priceRange:{minValue:100,maxValue:120},margins:{above:4,below:3}};
  assert.deepEqual(lock.apply(() => original), original);
  lock.freeze();
  const changed = () => ({priceRange:{minValue:90,maxValue:200}});
  const result = lock.apply(changed);
  assert.deepEqual(result, original);
  result.priceRange.minValue = 0;
  lock.freeze();
  assert.deepEqual(lock.apply(changed), original);
  lock.release();
  assert.deepEqual(lock.apply(changed), changed());
});

test('an empty chart can acquire its first valid price range', () => {
  const lock = createReplayScaleLock();
  lock.apply(() => null);
  lock.freeze();
  assert.equal(lock.frozen, false);
  const range = {priceRange:{minValue:1,maxValue:2}};
  lock.apply(() => range);
  lock.freeze();
  assert.equal(lock.frozen, true);
  assert.deepEqual(lock.apply(() => null), range);
});
