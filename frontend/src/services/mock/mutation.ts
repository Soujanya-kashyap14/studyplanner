import type { ChangeLog, MutationResponse, ScheduleResult, Snapshot } from '@/types';
import type { SchedulerInput } from '@/utils/scheduler';
import { MOCK_LATENCY } from '@/config/api';
import { delay } from '@/lib/http';
import { commitResult, currentUserId, db, schedulerInput } from './db';

type Handler = (
  snap: Snapshot,
  input: () => SchedulerInput,
) => { result?: ScheduleResult; trigger?: string; explanation?: string[] } | void;

/**
 * Run a mock "server-side" mutation: load the user's data, apply `fn`,
 * persist, and if the scheduler ran, record the change log entry.
 */
export async function mockMutation(fn: Handler): Promise<MutationResponse> {
  await delay(MOCK_LATENCY.write);
  const userId = currentUserId();
  let log: ChangeLog | undefined;
  let extra: { result?: ScheduleResult; explanation?: string[] } = {};
  const snapshot = db.mutate(userId, (snap) => {
    const out = fn(snap, () => schedulerInput(snap, userId)) || {};
    if (out.result) log = commitResult(snap, out.result, out.trigger ?? 'Plan updated');
    extra = { result: out.result, explanation: out.explanation };
  });
  return { snapshot, log, ...extra };
}
