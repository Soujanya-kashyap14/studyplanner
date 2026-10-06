import type { Request } from 'express';
import type { Model } from 'mongoose';
import type { ChangeLog as ChangeLogT, MutationResponse, ScheduleResult, Snapshot, User as UserT } from '@/types';
import type { SchedulerInput } from '@/utils/scheduler';
import { nowMinutes, todayISO } from '@/lib/date';
import { now } from '@/lib/clock';
import { uid } from '@/lib/utils';
import { DEFAULT_AVAILABILITY } from '@/data/defaults';
import { COLLECTIONS, User, type UserDoc } from './models';
import { clockFromRequest, withClock, type RequestClock } from '../lib/clock';
import { HttpError } from '../lib/http';

/** Strip Mongo-only fields so documents match the frontend types. */
function toPlain<T>(doc: Record<string, unknown>): T {
  const { _id, userId, ...rest } = doc;
  void _id;
  void userId;
  return rest as T;
}

export function publicUser(u: UserDoc): UserT {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    preferredSessionMinutes: u.preferredSessionMinutes ?? 50,
    breakMinutes: u.breakMinutes ?? 10,
    createdAt: (u as unknown as { createdAt?: Date }).createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function emptySnapshot(): Snapshot {
  return { subjects: [], topics: [], exams: [], assignments: [], sessions: [], availability: structuredClone(DEFAULT_AVAILABILITY), moods: [], changeLog: [], achievements: [], planStale: false };
}

/** Load everything a user owns as one Snapshot. */
export async function loadSnapshot(userId: string): Promise<{ user: UserDoc; snap: Snapshot }> {
  const user = await User.findById(userId).lean<UserDoc>();
  if (!user) throw new HttpError(401, 'Your account no longer exists. Please sign in again.');
  const parts = await Promise.all(COLLECTIONS.map((c) => (c.model as Model<unknown>).find({ userId }).lean()));
  const snap = emptySnapshot();
  COLLECTIONS.forEach((c, i) => {
    (snap as unknown as Record<string, unknown[]>)[c.key] = (parts[i] as Record<string, unknown>[]).map((d) => toPlain(d));
  });
  snap.changeLog.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  snap.availability = user.availability?.weekly?.length ? (structuredClone(user.availability) as Snapshot['availability']) : structuredClone(DEFAULT_AVAILABILITY);
  snap.availability.overrides ??= [];
  snap.planStale = Boolean(user.planStale);
  return { user, snap };
}

const clean = <T>(x: T): T => JSON.parse(JSON.stringify(x)); // drops undefined fields

/** Persist only what changed between two snapshots (one bulkWrite per collection). */
export async function persistDiff(userId: string, before: Snapshot, after: Snapshot) {
  const writes: Promise<unknown>[] = [];
  for (const { key, model, idField } of COLLECTIONS) {
    const prev = new Map(((before as unknown as Record<string, Record<string, unknown>[]>)[key] ?? []).map((d) => [String(d[idField]), JSON.stringify(clean(d))]));
    const nextDocs = (after as unknown as Record<string, Record<string, unknown>[]>)[key] ?? [];
    const next = new Set<string>();
    const ops: unknown[] = [];
    for (const doc of nextDocs) {
      const k = String(doc[idField]);
      next.add(k);
      const c = clean(doc);
      if (prev.get(k) !== JSON.stringify(c)) {
        ops.push({ replaceOne: { filter: { userId, [idField]: k }, replacement: { ...c, userId }, upsert: true } });
      }
    }
    for (const k of prev.keys()) if (!next.has(k)) ops.push({ deleteOne: { filter: { userId, [idField]: k } } });
    if (ops.length) writes.push((model as Model<unknown>).bulkWrite(ops as never[], { ordered: false }));
  }
  const userPatch: Record<string, unknown> = {};
  if (JSON.stringify(before.availability) !== JSON.stringify(after.availability)) userPatch.availability = clean(after.availability);
  if (Boolean(before.planStale) !== Boolean(after.planStale)) userPatch.planStale = Boolean(after.planStale);
  if (Object.keys(userPatch).length) writes.push(User.updateOne({ _id: userId }, { $set: userPatch }));
  await Promise.all(writes);
}

/** Scheduler input for this user, computed in the request's clock. */
export function schedulerInput(snap: Snapshot, user: UserDoc): SchedulerInput {
  const today = todayISO();
  return {
    subjects: snap.subjects,
    topics: snap.topics,
    exams: snap.exams,
    assignments: snap.assignments,
    sessions: snap.sessions,
    availability: snap.availability,
    today,
    nowMin: nowMinutes(),
    sessionMinutes: user.preferredSessionMinutes ?? 50,
    breakMinutes: user.breakMinutes ?? 10,
    mood: snap.moods.find((m) => m.date === today)?.mood,
  };
}

/** Record a scheduler result in the snapshot and its change log ("Plan updates"). */
export function commitResult(snap: Snapshot, result: ScheduleResult, trigger: string): ChangeLogT | undefined {
  snap.sessions = result.sessions;
  if (!result.changes.length && !result.warnings.length && trigger !== 'Plan generated') return undefined;
  const log: ChangeLogT = { id: uid('log'), createdAt: now().toISOString(), trigger, summary: result.summary, changes: result.changes, warnings: result.warnings };
  snap.changeLog = [log, ...snap.changeLog].slice(0, 20);
  return log;
}

export type Mutator = (
  snap: Snapshot,
  ctx: { input: () => SchedulerInput; user: UserDoc; clock: RequestClock },
) => { result?: ScheduleResult; trigger?: string; explanation?: string[] } | void;

/**
 * Load → change in memory (synchronously, in the student's clock) → save the diff → respond.
 * Every write endpoint goes through here, so the response is always a fresh snapshot.
 */
export async function mutate(req: Request, fn: Mutator): Promise<MutationResponse> {
  const userId = req.userId!;
  const clock = clockFromRequest(req);
  const { user, snap } = await loadSnapshot(userId);
  const before = structuredClone(snap);
  let log: ChangeLogT | undefined;
  let explanation: string[] | undefined;
  withClock(clock, () => {
    const out = fn(snap, { input: () => schedulerInput(snap, user), user, clock }) || {};
    if (out.result) log = commitResult(snap, out.result, out.trigger ?? 'Plan updated');
    explanation = out.explanation;
  });
  await persistDiff(userId, before, snap);
  return { snapshot: snap, log, explanation };
}

/** Read-only access to the snapshot with the request clock applied. */
export async function read<T>(req: Request, fn: (snap: Snapshot, input: SchedulerInput, user: UserDoc) => T): Promise<T> {
  const { user, snap } = await loadSnapshot(req.userId!);
  return withClock(clockFromRequest(req), () => fn(snap, schedulerInput(snap, user), user));
}
