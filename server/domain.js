import crypto from 'node:crypto';

export const DELIVERY_TRANSITIONS = Object.freeze({
  NEW: ['LOCATION_REQUIRED', 'LOCATION_CONFIRMED', 'CANCELLED'],
  LOCATION_REQUIRED: ['LOCATION_CONFIRMED', 'CANCELLED'],
  LOCATION_CONFIRMED: ['READY_FOR_DISPATCH', 'CANCELLED'],
  READY_FOR_DISPATCH: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['PICKED_UP', 'RESCHEDULED', 'CANCELLED'],
  PICKED_UP: ['OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'RESCHEDULED'],
  OUT_FOR_DELIVERY: ['ARRIVED', 'CUSTOMER_UNAVAILABLE', 'DELIVERY_FAILED'],
  ARRIVED: ['DELIVERED', 'CUSTOMER_UNAVAILABLE', 'DELIVERY_FAILED'],
  CUSTOMER_UNAVAILABLE: ['RESCHEDULED', 'CANCELLED'],
  DELIVERY_FAILED: ['RESCHEDULED', 'CANCELLED'],
  RESCHEDULED: ['READY_FOR_DISPATCH', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: []
});

export const RIDER_TRANSITIONS = new Set([
  'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED', 'DELIVERED', 'CUSTOMER_UNAVAILABLE', 'DELIVERY_FAILED'
]);

export const ASSIGNABLE_STATUSES = new Set(['READY_FOR_DISPATCH', 'LOCATION_CONFIRMED', 'ASSIGNED', 'RESCHEDULED']);
export const OPERATIONAL_ROLES = new Set(['ADMIN', 'DISPATCHER', 'RIDER']);

export function canTransition(from, to) {
  return Array.isArray(DELIVERY_TRANSITIONS[from]) && DELIVERY_TRANSITIONS[from].includes(to);
}

export function isValidCoordinate(point) {
  return Boolean(point) && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))
    && Number(point.lat) >= -90 && Number(point.lat) <= 90
    && Number(point.lng) >= -180 && Number(point.lng) <= 180;
}

export function safeHmacEquals(expectedBase64, provided) {
  if (!provided || typeof provided !== 'string') return false;
  const expected = Buffer.from(expectedBase64);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
