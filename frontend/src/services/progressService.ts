import type { ReadinessPrediction, Snapshot, Suggestion } from '@/types';
import { MOCK_LATENCY, USE_MOCK } from '@/config/api';
import { delay, http, json } from '@/lib/http';
import { currentUserId, db, schedulerInput } from './mock/db';
import { predictReadiness, projectProgress, smartSuggestions } from '@/utils/scheduler';

/**
 * Progress & analytics.
 * The UI derives charts locally from the snapshot (same pure functions as the
 * scheduler) so they react instantly to every change. These endpoints exist for
 * parity and for a future backend that pre-computes heavier analytics.
 */
export const progressService = {
  /** GET /me/snapshot — everything the app needs in one round trip. */
  async getSnapshot(): Promise<Snapshot> {
    if (!USE_MOCK) return http<Snapshot>('/me/snapshot');
    await delay(MOCK_LATENCY.read);
    return db.snapshot(currentUserId());
  },

  /** GET /analytics/readiness */
  async getReadiness(): Promise<ReadinessPrediction[]> {
    if (!USE_MOCK) return http('/analytics/readiness');
    await delay(MOCK_LATENCY.write);
    const uid = currentUserId();
    const snap = db.snapshot(uid);
    const input = schedulerInput(snap, uid);
    return snap.exams.map((e) => predictReadiness(e, input));
  },

  /** GET /analytics/suggestions */
  async getSuggestions(): Promise<Suggestion[]> {
    if (!USE_MOCK) return http('/analytics/suggestions');
    await delay(MOCK_LATENCY.write);
    const uid = currentUserId();
    const snap = db.snapshot(uid);
    return smartSuggestions(schedulerInput(snap, uid));
  },

  /** GET /analytics/projection */
  async getProjection() {
    if (!USE_MOCK) return http<ReturnType<typeof projectProgress>>('/analytics/projection');
    await delay(MOCK_LATENCY.write);
    const uid = currentUserId();
    const snap = db.snapshot(uid);
    return projectProgress(schedulerInput(snap, uid));
  },

  /**
   * PUT /me/snapshot  body: Snapshot — restore an earlier state (powers "Undo").
   * A real backend would expose per-action undo; this keeps the contract simple.
   */
  async restoreSnapshot(snapshot: Snapshot): Promise<Snapshot> {
    if (!USE_MOCK) return http<Snapshot>('/me/snapshot', { method: 'PUT', ...json(snapshot) });
    await delay(MOCK_LATENCY.write);
    return db.mutate(currentUserId(), (s) => Object.assign(s, structuredClone(snapshot)));
  },

  /** DELETE /me/data — wipe everything and start the guided setup again. */
  async clearData(): Promise<Snapshot> {
    if (!USE_MOCK) return http<Snapshot>('/me/data', { method: 'DELETE' });
    await delay(MOCK_LATENCY.read);
    return db.clear(currentUserId());
  },

  /** POST /demo/reset — restore the rich seed dataset. */
  async resetDemoData(): Promise<Snapshot> {
    if (!USE_MOCK) return http<Snapshot>('/demo/reset', { method: 'POST' });
    await delay(MOCK_LATENCY.read);
    return db.reset(currentUserId());
  },
};
