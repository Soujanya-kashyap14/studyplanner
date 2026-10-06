import { Router } from 'express';
import { z } from 'zod';
import type { Snapshot } from '@/types';
import { createSeed } from '@/data/seed';
import { predictReadiness, projectProgress, smartSuggestions } from '@/utils/scheduler';
import { buildRuleBriefing } from '@/utils/briefing';
import { emptySnapshot, loadSnapshot, persistDiff, publicUser, read } from '../db/snapshot';
import { clockFromRequest, withClock } from '../lib/clock';
import { body, handler } from '../lib/http';
import { availabilitySchema } from './schemas';

export const meRouter = Router();

/** GET /me/snapshot — everything the app needs in one round trip. */
meRouter.get(
  '/me/snapshot',
  handler(async (req, res) => {
    const { snap } = await loadSnapshot(req.userId!);
    res.json(snap);
  }),
);

/** Replace the user's data with `next` and return it. */
async function replaceAll(userId: string, next: Snapshot) {
  const { snap: current } = await loadSnapshot(userId);
  await persistDiff(userId, current, next);
  return (await loadSnapshot(userId)).snap;
}

const anyArray = z.array(z.record(z.unknown()));
const snapshotSchema = z.object({
  subjects: anyArray,
  topics: anyArray,
  exams: anyArray,
  assignments: anyArray,
  sessions: anyArray,
  availability: availabilitySchema,
  moods: anyArray,
  changeLog: anyArray,
  achievements: anyArray.default([]),
  planStale: z.boolean().optional(),
});

/** PUT /me/snapshot — restore an earlier state (powers "Undo" in the app). */
meRouter.put(
  '/me/snapshot',
  handler(async (req, res) => {
    const next = body(req, snapshotSchema) as unknown as Snapshot;
    res.json(await replaceAll(req.userId!, next));
  }),
);

/** DELETE /me/data — wipe everything (Settings → Start fresh). */
meRouter.delete(
  '/me/data',
  handler(async (req, res) => {
    res.json(await replaceAll(req.userId!, emptySnapshot()));
  }),
);

/** POST /demo/reset — replace the user's data with the sample universe. */
meRouter.post(
  '/demo/reset',
  handler(async (req, res) => {
    const { user } = await loadSnapshot(req.userId!);
    const seed = withClock(clockFromRequest(req), () => createSeed(user.preferredSessionMinutes ?? 50, user.breakMinutes ?? 10));
    res.json(await replaceAll(req.userId!, seed));
  }),
);

/* ---------------- analytics & briefing ---------------- */

meRouter.get(
  '/analytics/readiness',
  handler(async (req, res) => {
    res.json(await read(req, (snap, input) => snap.exams.map((e) => predictReadiness(e, input))));
  }),
);

meRouter.get(
  '/analytics/suggestions',
  handler(async (req, res) => {
    res.json(await read(req, (_snap, input) => smartSuggestions(input)));
  }),
);

meRouter.get(
  '/analytics/projection',
  handler(async (req, res) => {
    res.json(await read(req, (_snap, input) => projectProgress(input)));
  }),
);

/** GET /briefing/today — rule-based for now (⚡ swap in an LLM call here later). */
meRouter.get(
  '/briefing/today',
  handler(async (req, res) => {
    res.json(await read(req, (snap, input, user) => buildRuleBriefing(snap, publicUser(user), input)));
  }),
);
