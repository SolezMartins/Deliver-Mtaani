import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, isValidCoordinate, ASSIGNABLE_STATUSES, RIDER_TRANSITIONS } from '../server/domain.js';

 test('delivery state machine allows valid progression and blocks terminal reversal', () => {
  assert.equal(canTransition('ASSIGNED', 'PICKED_UP'), true);
  assert.equal(canTransition('DELIVERED', 'ASSIGNED'), false);
  assert.equal(canTransition('CANCELLED', 'READY_FOR_DISPATCH'), false);
});

test('assignment only accepts operational assignment states', () => {
  assert.equal(ASSIGNABLE_STATUSES.has('READY_FOR_DISPATCH'), true);
  assert.equal(ASSIGNABLE_STATUSES.has('DELIVERED'), false);
});

test('rider transitions exclude dispatcher-only changes', () => {
  assert.equal(RIDER_TRANSITIONS.has('DELIVERED'), true);
  assert.equal(RIDER_TRANSITIONS.has('ASSIGNED'), false);
});

test('coordinate validation rejects malformed or out-of-range coordinates', () => {
  assert.equal(isValidCoordinate({ lat: -1.28, lng: 36.82 }), true);
  assert.equal(isValidCoordinate({ lat: 95, lng: 36.82 }), false);
  assert.equal(isValidCoordinate({ lat: -1.28, lng: 200 }), false);
  assert.equal(isValidCoordinate({ lat: 'nope', lng: 36.82 }), false);
});
