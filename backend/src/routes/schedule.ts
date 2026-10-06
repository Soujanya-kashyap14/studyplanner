import { Router } from 'express';
import { z } from 'zod';
import { now } from '@/lib/clock';
import { round1 } from '@/lib/utils';
import { formatWeekday, todayISO } from '@/lib/date';
import {
  addExtraSession,
  applyMood,
  generatePlan,
  moveSession,
  rankTopics,
  reflowForAvailability,
  rescheduleAfterCompletion,
  rescheduleMissed,
  rolloverPastSessions,
} from '@/utils/scheduler';
import { planRestDay } from '@/utils/insights';
import { mutate } from '../db/snapshot';
import { body, handler, HttpError, notFound } from '../lib/http';
import { availabilitySchema, slotSchema } from './schemas';

export const scheduleRouter = Router();

/** PUT /availability — save study hours and re-fit the existing plan into them. */
scheduleRouter.put(
  '/availability',
  handler(async (req, res) => {
    const availability = body(req, availabilitySchema);
    res.json(
      await mutate(req, (snap, { input }) => {
        // Buffer days only apply when the plan is generated, so changing them asks for a fresh plan.
        if ((snap.availability.bufferBeforeExams !== false) !== (availability.bufferBeforeExams !== false)) snap.planStale = true;
        snap.availability = availability;
        const hasPlan = snap.sessions.some((s) => s.status === 'planned' && s.date >= todayISO());
        if (hasPlan) return { result: reflowForAvailability(input()), trigger: 'Study hours changed' };
        snap.planStale = true;
      }),
    );
  }),
);

/** POST /schedule/generate — build the plan from today. */
const generate = handler(async (req, res) => {
  res.json(
    await mutate(req, (snap, { input }) => {
      if (!snap.topics.some((t) => t.status !== 'completed' && t.estimatedHours > t.completedHours)) throw new HttpError(400, 'Nothing to schedule yet — add topics with estimated hours first.');
      snap.planStale = false;
      return { result: generatePlan(input()), trigger: 'Plan generated' };
    }),
  );
});
scheduleRouter.post('/schedule/generate', generate);
/** ⚡ AI INTEGRATION PLACEHOLDER — POST /schedule/generate-ai currently uses the same rule-based scheduler. */
scheduleRouter.post('/schedule/generate-ai', generate);

/** PUT /sessions/:id/move  { date, start } — pin a session; the rest reflows around it. */
scheduleRouter.put(
  '/sessions/:id/move',
  handler(async (req, res) => {
    const to = body(req, slotSchema);
    res.json(
      await mutate(req, (snap, { input }) => {
        if (!snap.sessions.some((s) => s.id === req.params.id && s.status === 'planned')) throw notFound('Planned session');
        if (to.date < todayISO()) throw new HttpError(400, "You can't move a session into the past.");
        return { result: moveSession(input(), req.params.id, to), trigger: 'Manual move' };
      }),
    );
  }),
);

/** PUT /sessions/:id/status  { status, actualMin? } — miss / finish early reschedule automatically. */
scheduleRouter.put(
  '/sessions/:id/status',
  handler(async (req, res) => {
    const { status, actualMin } = body(req, z.object({ status: z.enum(['planned', 'in_progress', 'completed', 'missed']), actualMin: z.number().min(1).max(600).optional() }));
    const id = req.params.id;
    res.json(
      await mutate(req, (snap, { input }) => {
        const session = snap.sessions.find((s) => s.id === id);
        if (!session) throw notFound('Session');

        if (status === 'missed') return { result: rescheduleMissed(input(), [id]), trigger: 'Missed session' };

        if (status === 'completed') {
          const minutes = Math.max(1, Math.round(actualMin ?? session.durationMin));
          session.status = 'completed';
          session.actualMin = minutes;
          session.completedAt = now().toISOString();
          session.locked = true;
          // A spaced-repetition review doesn't add study hours to its topic.
          if (session.kind === 'revision') {
            if (minutes < session.durationMin) return { result: rescheduleAfterCompletion(input(), id, false), trigger: 'Finished early' };
            return;
          }
          let topicDone = false;
          snap.topics = snap.topics.map((t) => {
            if (t.id !== session.topicId) return t;
            const completedHours = round1(t.completedHours + minutes / 60);
            topicDone = completedHours >= t.estimatedHours;
            return { ...t, completedHours: Math.min(completedHours, t.estimatedHours), status: topicDone ? 'completed' : 'in_progress', completedAt: topicDone ? now().toISOString() : t.completedAt };
          });
          const early = minutes < session.durationMin;
          if (early || topicDone) return { result: rescheduleAfterCompletion(input(), id, topicDone), trigger: topicDone ? 'Topic complete' : 'Finished early' };
          return;
        }

        session.status = status;
        if (status === 'planned') {
          session.actualMin = undefined;
          session.completedAt = undefined;
        }
        if (status === 'in_progress') snap.topics = snap.topics.map((t) => (t.id === session.topicId && t.status === 'not_started' ? { ...t, status: 'in_progress' } : t));
      }),
    );
  }),
);

/** POST /mood  { mood } — today's energy; returns plain-language explanation lines. */
scheduleRouter.post(
  '/mood',
  handler(async (req, res) => {
    const { mood } = body(req, z.object({ mood: z.enum(['energized', 'okay', 'drained']) }));
    res.json(
      await mutate(req, (snap, { input }) => {
        const today = todayISO();
        // Burnout guard: repeated low energy or a long heavy run earns a rest day.
        const rest = planRestDay({ today, mood, moods: snap.moods, sessions: snap.sessions, exams: snap.exams, availability: snap.availability });
        if (rest) snap.availability = { ...snap.availability, overrides: [...snap.availability.overrides.filter((o) => o.date !== rest.override.date), rest.override] };
        const r = applyMood({ ...input(), mood: undefined }, mood);
        snap.moods = [...snap.moods.filter((m) => m.date !== today), { date: today, mood, createdAt: now().toISOString() }];
        const explanation = rest
          ? [...r.explanation, `Burnout guard: ${rest.reasons.join(' ')} ${formatWeekday(rest.override.date)} is now a rest day — its sessions moved to other days.`]
          : r.explanation;
        return { result: r, trigger: 'Mood check-in', explanation };
      }),
    );
  }),
);

/** POST /schedule/rollover — day changed: past planned sessions become missed and reflow. */
scheduleRouter.post(
  '/schedule/rollover',
  handler(async (req, res) => {
    res.json(await mutate(req, (_snap, { input }) => ({ result: rolloverPastSessions(input()), trigger: 'New day' })));
  }),
);

/** POST /schedule/extra-session  { subjectId, minutes? } */
scheduleRouter.post(
  '/schedule/extra-session',
  handler(async (req, res) => {
    const { subjectId, minutes } = body(req, z.object({ subjectId: z.string(), minutes: z.number().int().min(15).max(240).optional() }));
    res.json(
      await mutate(req, (_snap, { input }) => {
        const inp = input();
        const top = rankTopics(inp).find((r) => r.topic.subjectId === subjectId);
        if (!top) throw new HttpError(400, 'This subject has no open topics left.');
        return { result: addExtraSession(inp, top.topic.id, minutes), trigger: 'Extra session' };
      }),
    );
  }),
);

/** POST /demo/simulate-miss — Demo Mode: miss the next planned session. */
scheduleRouter.post(
  '/demo/simulate-miss',
  handler(async (req, res) => {
    res.json(
      await mutate(req, (snap, { input }) => {
        const today = todayISO();
        const next = snap.sessions.filter((s) => s.status === 'planned' && s.date >= today).sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1))[0];
        if (!next) throw new HttpError(400, 'No upcoming sessions to miss. Generate a plan first.');
        return { result: rescheduleMissed(input(), [next.id]), trigger: 'Missed session' };
      }),
    );
  }),
);
