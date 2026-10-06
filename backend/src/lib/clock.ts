import type { Request } from 'express';
import { setClockOffset, setClockShiftMs } from '@/lib/clock';

/**
 * The shared date/scheduler code reads a module-level clock. Each request carries
 * the student's timezone and Demo Mode offset; we apply them only for the duration
 * of a *synchronous* block, so concurrent requests can never see each other's clock.
 */
export interface RequestClock {
  offsetDays: number;
  shiftMs: number;
}

export function clockFromRequest(req: Request): RequestClock {
  const clientTz = Number(req.header('x-orbit-tz-offset'));
  const offsetDays = Number(req.header('x-orbit-clock-offset'));
  const serverTz = new Date().getTimezoneOffset();
  return {
    offsetDays: Number.isFinite(offsetDays) ? Math.max(-365, Math.min(365, Math.trunc(offsetDays))) : 0,
    // Shift server-local wall time to the student's wall time.
    shiftMs: Number.isFinite(clientTz) ? (serverTz - clientTz) * 60_000 : 0,
  };
}

/** Run `fn` with the request's clock applied. `fn` must be synchronous. */
export function withClock<T>(clock: RequestClock, fn: () => T): T {
  setClockOffset(clock.offsetDays);
  setClockShiftMs(clock.shiftMs);
  try {
    return fn();
  } finally {
    setClockOffset(0);
    setClockShiftMs(0);
  }
}
