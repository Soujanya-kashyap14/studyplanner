import { Router } from 'express';
import { z } from 'zod';
import type { Difficulty, Snapshot } from '@/types';
import { uid } from '@/lib/utils';
import { now } from '@/lib/clock';
import { generatePlan, rescheduleTopicCompleted } from '@/utils/scheduler';
import { mutate } from '../db/snapshot';
import { body, handler, HttpError, notFound } from '../lib/http';
import { availabilitySchema } from './schemas';

export const dataRouter = Router();

/* ---------------- validation ---------------- */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-14.');
const isoDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/, 'Use a date and time like 2026-10-14T09:00:00.');
const difficulty = z.number().int().min(1).max(5).transform((v) => v as Difficulty);
const subjectInput = z.object({ name: z.string().trim().min(2, 'Subject name is too short.').max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value.'), difficulty });
const topicInput = z.object({
  name: z.string().trim().min(2, 'Topic name is too short.').max(60),
  difficulty,
  estimatedHours: z.number().min(0.5).max(100),
  status: z.enum(['not_started', 'in_progress', 'completed']).optional(),
  deadline: isoDate.optional(),
  weightage: z.number().min(0).max(100).optional(),
  frequentlyAsked: z.boolean().optional(),
});
const examInput = z.object({ subjectId: z.string(), title: z.string().trim().min(2).max(80), date: isoDateTime, topicIds: z.array(z.string()).default([]), location: z.string().max(80).optional() });
const assignmentInput = z.object({ subjectId: z.string(), title: z.string().trim().min(2).max(80), dueDate: isoDateTime, status: z.enum(['todo', 'in_progress', 'done']).default('todo'), topicId: z.string().optional() });
const achievementInput = z.object({
  title: z.string().trim().min(2, 'Describe the achievement.').max(90),
  category: z.enum(['grades', 'exam', 'subjects', 'award', 'project', 'other']),
  date: isoDate,
  subjectId: z.string().optional(),
  result: z.string().trim().max(30).optional(),
  note: z.string().trim().max(200).optional(),
});

const need = (ok: boolean, what: string) => {
  if (!ok) throw notFound(what);
};
const hasSubject = (s: Snapshot, id: string) => s.subjects.some((x) => x.id === id);

/* ---------------- subjects & topics ---------------- */

dataRouter.post(
  '/subjects',
  handler(async (req, res) => {
    const input = body(req, subjectInput);
    res.status(201).json(
      await mutate(req, (snap) => {
        snap.subjects.push({ id: uid('sub'), ...input, createdAt: now().toISOString() });
        snap.planStale = true;
      }),
    );
  }),
);

dataRouter.patch(
  '/subjects/:id',
  handler(async (req, res) => {
    const patch = body(req, subjectInput.partial());
    res.json(
      await mutate(req, (snap) => {
        need(hasSubject(snap, req.params.id), 'Subject');
        snap.subjects = snap.subjects.map((s) => (s.id === req.params.id ? { ...s, ...patch } : s));
        snap.planStale = true;
      }),
    );
  }),
);

dataRouter.delete(
  '/subjects/:id',
  handler(async (req, res) => {
    const id = req.params.id;
    res.json(
      await mutate(req, (snap) => {
        need(hasSubject(snap, id), 'Subject');
        snap.subjects = snap.subjects.filter((s) => s.id !== id);
        snap.topics = snap.topics.filter((t) => t.subjectId !== id);
        snap.exams = snap.exams.filter((e) => e.subjectId !== id);
        snap.assignments = snap.assignments.filter((a) => a.subjectId !== id);
        snap.sessions = snap.sessions.filter((s) => s.subjectId !== id);
        snap.achievements = snap.achievements.map((a) => (a.subjectId === id ? { ...a, subjectId: undefined } : a));
        snap.planStale = true;
      }),
    );
  }),
);

dataRouter.post(
  '/subjects/:subjectId/topics',
  handler(async (req, res) => {
    const input = body(req, topicInput);
    const { subjectId } = req.params;
    res.status(201).json(
      await mutate(req, (snap) => {
        need(hasSubject(snap, subjectId), 'Subject');
        snap.topics.push({
          id: uid('top'),
          subjectId,
          name: input.name,
          difficulty: input.difficulty,
          estimatedHours: input.estimatedHours,
          completedHours: 0,
          status: input.status ?? 'not_started',
          deadline: input.deadline,
          order: snap.topics.filter((t) => t.subjectId === subjectId).length,
          weightage: input.weightage || undefined,
          frequentlyAsked: input.frequentlyAsked || undefined,
        });
        snap.planStale = true;
      }),
    );
  }),
);

dataRouter.patch(
  '/topics/:id',
  handler(async (req, res) => {
    const patch = body(req, topicInput.partial());
    res.json(
      await mutate(req, (snap) => {
        need(snap.topics.some((t) => t.id === req.params.id), 'Topic');
        snap.topics = snap.topics.map((t) =>
          t.id === req.params.id ? { ...t, ...patch, weightage: (patch.weightage ?? t.weightage) || undefined, frequentlyAsked: (patch.frequentlyAsked ?? t.frequentlyAsked) || undefined } : t,
        );
        snap.planStale = true;
      }),
    );
  }),
);

dataRouter.delete(
  '/topics/:id',
  handler(async (req, res) => {
    const id = req.params.id;
    res.json(
      await mutate(req, (snap) => {
        need(snap.topics.some((t) => t.id === id), 'Topic');
        snap.topics = snap.topics.filter((t) => t.id !== id);
        snap.sessions = snap.sessions.filter((s) => s.topicId !== id);
        snap.exams = snap.exams.map((e) => ({ ...e, topicIds: e.topicIds.filter((x) => x !== id) }));
        snap.planStale = true;
      }),
    );
  }),
);

/** PUT /topics/:id/status — completing a topic removes its remaining sessions and pulls work forward. */
dataRouter.put(
  '/topics/:id/status',
  handler(async (req, res) => {
    const { status } = body(req, z.object({ status: z.enum(['not_started', 'in_progress', 'completed']) }));
    const id = req.params.id;
    res.json(
      await mutate(req, (snap, { input }) => {
        need(snap.topics.some((t) => t.id === id), 'Topic');
        snap.topics = snap.topics.map((t) =>
          t.id === id
            ? { ...t, status, completedHours: status === 'completed' ? Math.max(t.completedHours, t.estimatedHours) : t.completedHours, completedAt: status === 'completed' ? now().toISOString() : undefined }
            : t,
        );
        if (status === 'completed') return { result: rescheduleTopicCompleted(input(), id), trigger: 'Topic complete' };
      }),
    );
  }),
);

/* ---------------- exams & assignments ---------------- */

dataRouter.post(
  '/exams',
  handler(async (req, res) => {
    const input = body(req, examInput);
    res.status(201).json(
      await mutate(req, (snap) => {
        need(hasSubject(snap, input.subjectId), 'Subject');
        snap.exams.push({ id: uid('exm'), ...input });
        snap.planStale = true;
      }),
    );
  }),
);

dataRouter.patch(
  '/exams/:id',
  handler(async (req, res) => {
    const patch = body(req, examInput.partial());
    res.json(
      await mutate(req, (snap) => {
        need(snap.exams.some((e) => e.id === req.params.id), 'Exam');
        snap.exams = snap.exams.map((e) => (e.id === req.params.id ? { ...e, ...patch } : e));
        snap.planStale = true;
      }),
    );
  }),
);

dataRouter.delete(
  '/exams/:id',
  handler(async (req, res) => {
    res.json(
      await mutate(req, (snap) => {
        need(snap.exams.some((e) => e.id === req.params.id), 'Exam');
        snap.exams = snap.exams.filter((e) => e.id !== req.params.id);
        snap.planStale = true;
      }),
    );
  }),
);

dataRouter.post(
  '/assignments',
  handler(async (req, res) => {
    const input = body(req, assignmentInput);
    res.status(201).json(
      await mutate(req, (snap) => {
        need(hasSubject(snap, input.subjectId), 'Subject');
        snap.assignments.push({ id: uid('asg'), ...input });
        snap.planStale = true;
      }),
    );
  }),
);

dataRouter.patch(
  '/assignments/:id',
  handler(async (req, res) => {
    const patch = body(req, assignmentInput.partial());
    res.json(
      await mutate(req, (snap) => {
        need(snap.assignments.some((a) => a.id === req.params.id), 'Assignment');
        snap.assignments = snap.assignments.map((a) => (a.id === req.params.id ? { ...a, ...patch } : a));
        snap.planStale = true;
      }),
    );
  }),
);

dataRouter.delete(
  '/assignments/:id',
  handler(async (req, res) => {
    res.json(
      await mutate(req, (snap) => {
        need(snap.assignments.some((a) => a.id === req.params.id), 'Assignment');
        snap.assignments = snap.assignments.filter((a) => a.id !== req.params.id);
        snap.planStale = true;
      }),
    );
  }),
);

/* ---------------- achievements (recorded by the student) ---------------- */

dataRouter.post(
  '/achievements',
  handler(async (req, res) => {
    const input = body(req, achievementInput);
    res.status(201).json(
      await mutate(req, (snap) => {
        if (input.subjectId) need(hasSubject(snap, input.subjectId), 'Subject');
        snap.achievements.push({ id: uid('ach'), ...input, createdAt: now().toISOString() });
      }),
    );
  }),
);

dataRouter.patch(
  '/achievements/:id',
  handler(async (req, res) => {
    const patch = body(req, achievementInput.partial());
    res.json(
      await mutate(req, (snap) => {
        need(snap.achievements.some((a) => a.id === req.params.id), 'Achievement');
        snap.achievements = snap.achievements.map((a) => (a.id === req.params.id ? { ...a, ...patch } : a));
      }),
    );
  }),
);

dataRouter.delete(
  '/achievements/:id',
  handler(async (req, res) => {
    res.json(
      await mutate(req, (snap) => {
        need(snap.achievements.some((a) => a.id === req.params.id), 'Achievement');
        snap.achievements = snap.achievements.filter((a) => a.id !== req.params.id);
      }),
    );
  }),
);

/* ---------------- guided setup ---------------- */

const setupInput = z.object({
  subjects: z
    .array(z.object({ name: z.string().trim().min(2).max(40), color: z.string(), difficulty, topics: z.array(z.object({ name: z.string().trim().min(2).max(60), estimatedHours: z.number().min(0.5).max(100), difficulty })).min(1) }))
    .min(1, 'Add at least one subject.'),
  deadlines: z.array(z.object({ subjectIndex: z.number().int().min(0), kind: z.enum(['exam', 'assignment']), title: z.string().trim().min(2).max(80), date: isoDateTime })).default([]),
  availability: availabilitySchema,
});

/** POST /setup — save everything from the wizard and generate the first plan. */
dataRouter.post(
  '/setup',
  handler(async (req, res) => {
    const input = body(req, setupInput);
    res.status(201).json(
      await mutate(req, (snap, { input: schedInput }) => {
        const created = now().toISOString();
        const subjectIds: string[] = [];
        const topicIds: string[][] = [];
        for (const s of input.subjects) {
          const subjectId = uid('sub');
          snap.subjects.push({ id: subjectId, name: s.name, color: s.color, difficulty: s.difficulty, createdAt: created });
          const ids = s.topics.map((t, order) => {
            const id = uid('top');
            snap.topics.push({ id, subjectId, name: t.name, difficulty: t.difficulty, estimatedHours: t.estimatedHours, completedHours: 0, status: 'not_started', order });
            return id;
          });
          subjectIds.push(subjectId);
          topicIds.push(ids);
        }
        for (const dl of input.deadlines) {
          const subjectId = subjectIds[dl.subjectIndex];
          if (!subjectId) throw new HttpError(400, 'A deadline points at a subject that does not exist.');
          if (dl.kind === 'exam') snap.exams.push({ id: uid('exm'), subjectId, title: dl.title, date: dl.date, topicIds: topicIds[dl.subjectIndex] });
          else snap.assignments.push({ id: uid('asg'), subjectId, title: dl.title, dueDate: dl.date, status: 'todo' });
        }
        snap.availability = input.availability;
        snap.planStale = false;
        return { result: generatePlan(schedInput()), trigger: 'Plan generated' };
      }),
    );
  }),
);
