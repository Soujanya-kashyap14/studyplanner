/**
 * App clock. All "what day is it" logic goes through `now()` so that
 * Demo Mode can fast-forward time and trigger the Living Schedule reflow.
 * The offset is persisted by the UI store and pushed here on load.
 *
 * The backend reuses this module: it sets `shiftMs` per request so that
 * dates are computed in the student's timezone, not the server's.
 */
let offsetDays = 0;
let shiftMs = 0;

export function setClockOffset(days: number) {
  offsetDays = days;
}

export function getClockOffset() {
  return offsetDays;
}

/** Extra shift in milliseconds (server side: student timezone vs server timezone). */
export function setClockShiftMs(ms: number) {
  shiftMs = ms;
}

export function now(): Date {
  return new Date(Date.now() + offsetDays * 86_400_000 + shiftMs);
}
