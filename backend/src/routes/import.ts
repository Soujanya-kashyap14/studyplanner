import express, { Router } from 'express';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import type { Difficulty, ImportDraft } from '@/types';
import { now } from '@/lib/clock';
import { plural } from '@/lib/utils';
import { todayISO } from '@/lib/date';
import { applyImport, parseSyllabus } from '@/utils/syllabus';
import { config } from '../config';
import { mutate } from '../db/snapshot';
import { body, handler, HttpError } from '../lib/http';

/**
 * Syllabus / timetable import.
 *   POST /import/extract  { text?, file? }  → ImportDraft (nothing is saved)
 *   POST /import/apply    { subjects, exams } → MutationResponse
 *
 * With ANTHROPIC_API_KEY set, Claude reads the upload directly (works for
 * scanned PDFs and photos of timetables). Otherwise — or if the call fails —
 * Orbit's built-in parser reads the text the browser extracted.
 */
export const importRouter = Router();
importRouter.use('/import', express.json({ limit: '15mb' }));

const MODEL = 'claude-opus-5-5';
const MEDIA_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

const difficulty = z.number().int().min(1).max(5).transform((v) => v as Difficulty);
const draftSchema = z.object({
  subjects: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(40),
        difficulty,
        topics: z.array(
          z.object({
            name: z.string().trim().min(2).max(60),
            estimatedHours: z.number().min(0.5).max(100),
            difficulty,
            weightage: z.number().min(0).max(100).optional(),
            frequentlyAsked: z.boolean().optional(),
          }),
        ),
      }),
    )
    .max(30),
  exams: z.array(z.object({ subjectIndex: z.number().int(), title: z.string().trim().min(2).max(80), date: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/) })).max(60),
});

const extractInput = z
  .object({
    text: z.string().max(200_000).optional(),
    /** Original file name — names the subject when the document itself doesn't. */
    fileName: z.string().max(200).optional(),
    file: z.object({ name: z.string().max(200), mediaType: z.enum(MEDIA_TYPES), data: z.string().max(14_000_000) }).optional(),
  })
  .refine((x) => (x.text?.trim().length ?? 0) > 0 || x.file, 'Upload a file or paste the syllabus text.');

/* ---------------- Claude ---------------- */

const topicJson = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'estimatedHours', 'difficulty', 'weightage', 'frequentlyAsked'],
  properties: {
    name: { type: 'string', description: 'Unit / module / chapter title, short (max 60 chars).' },
    estimatedHours: { type: 'number', description: 'Self-study hours: lecture hours if listed, otherwise 2-10 based on how much the unit covers.' },
    difficulty: { type: 'integer', enum: [1, 2, 3, 4, 5], description: '1 gentle … 5 very hard; 3 when unsure.' },
    weightage: { type: 'number', description: 'Marks or % weightage of this unit in the exam, 0 when not stated.' },
    frequentlyAsked: { type: 'boolean', description: 'True only when the document marks it important / frequently asked / previous-year.' },
  },
};
const draftJson = {
  type: 'object',
  additionalProperties: false,
  required: ['subjects', 'exams', 'notes'],
  properties: {
    subjects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'difficulty', 'topics'],
        properties: {
          name: { type: 'string', description: 'Course / subject name without the course code (max 40 chars).' },
          difficulty: { type: 'integer', enum: [1, 2, 3, 4, 5] },
          topics: { type: 'array', items: topicJson },
        },
      },
    },
    exams: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['subjectIndex', 'title', 'date'],
        properties: {
          subjectIndex: { type: 'integer', description: 'Index into subjects, or -1 when the exam matches no subject.' },
          title: { type: 'string', description: 'e.g. "Mid-term exam", "End-semester exam".' },
          date: { type: 'string', description: 'Local date and time as YYYY-MM-DDTHH:mm (09:00 when no time is given).' },
        },
      },
    },
    notes: { type: 'array', items: { type: 'string' }, description: 'Short notes for the student about anything ambiguous or skipped.' },
  },
};

const SYSTEM = `You read university and school syllabi, exam timetables and course outlines, and extract a study plan skeleton for a student planner.

Extract:
- subjects: each course in the document. Topics are its units / modules / chapters (not individual bullet points, not textbooks, references, course outcomes or lab lists).
- exams: every dated exam, test, quiz, viva or assessment that is in the future relative to today's date. Skip past dates. When a year is missing, use the next occurrence after today. Numeric dates in Indian/European documents are day-first (14/11/2026 = 14 November).

Only report what the document says; never invent topics or dates. Put anything ambiguous in notes.`;

async function extractWithClaude(input: z.infer<typeof extractInput>, today: string): Promise<ImportDraft> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (input.file?.mediaType === 'application/pdf') {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.file.data } });
  } else if (input.file) {
    content.push({ type: 'image', source: { type: 'base64', media_type: input.file.mediaType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif', data: input.file.data } });
  }
  if (input.text?.trim()) content.push({ type: 'text', text: `<syllabus_text>\n${input.text.trim()}\n</syllabus_text>` });
  content.push({ type: 'text', text: `${input.fileName ? `File name: ${input.fileName}. ` : ''}Today is ${today}. Extract the subjects, topics and upcoming exams from this ${input.file ? 'document' : 'text'}.` });

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: draftJson } },
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal') throw new HttpError(422, "Orbit's reader declined this file. Try pasting the syllabus text instead.");
  if (response.stop_reason === 'max_tokens') throw new HttpError(422, 'This document is too long to read in one go. Try importing one subject at a time.');
  const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text;
  if (!text) throw new Error('Empty response from Claude');

  const raw = JSON.parse(text) as { subjects: unknown[]; exams: unknown[]; notes: string[] };
  // Clean the model's answer the same way user input is cleaned.
  const subjects = (raw.subjects as ImportDraft['subjects']).map((s) => ({
    ...s,
    name: s.name.slice(0, 40),
    topics: s.topics
      .filter((t) => t.name.trim().length >= 2)
      .map((t) => ({
        name: t.name.slice(0, 60),
        estimatedHours: Math.min(100, Math.max(0.5, Math.round(t.estimatedHours * 2) / 2)),
        difficulty: t.difficulty,
        ...(t.weightage && t.weightage > 0 ? { weightage: Math.min(100, t.weightage) } : {}),
        ...(t.frequentlyAsked ? { frequentlyAsked: true } : {}),
      })),
  }));
  const exams = (raw.exams as ImportDraft['exams']).filter((e) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(e.date) && e.date.slice(0, 10) >= today).map((e) => ({ ...e, date: e.date.slice(0, 16), subjectIndex: e.subjectIndex < subjects.length ? e.subjectIndex : -1 }));
  const topics = subjects.reduce((a, s) => a + s.topics.length, 0);
  return { subjects, exams, source: 'ai', notes: [`Found ${plural(subjects.length, 'subject')}, ${plural(topics, 'topic')} and ${plural(exams.length, 'exam date')}.`, ...raw.notes.slice(0, 6)] };
}

/* ---------------- routes ---------------- */

/** GET /import/status — can the server read scanned PDFs and photos? */
importRouter.get(
  '/import/status',
  handler(async (_req, res) => {
    res.json({ ai: Boolean(config.anthropicApiKey) });
  }),
);

importRouter.post(
  '/import/extract',
  handler(async (req, res) => {
    const input = body(req, extractInput);
    const today = todayISO();
    if (config.anthropicApiKey) {
      try {
        return res.json(await extractWithClaude(input, today));
      } catch (e) {
        if (e instanceof HttpError) throw e;
        const why = e instanceof Anthropic.APIError ? `${e.status ?? ''} ${e.message}` : String(e);
        console.warn('  ✦ Claude import failed, using the built-in parser:', why);
        if (!input.text?.trim()) throw new HttpError(502, "Couldn't read this file right now. Paste the syllabus text instead and try again.");
        const draft = parseSyllabus(input.text, today, { fileName: input.fileName });
        return res.json({ ...draft, notes: ['The AI reader was unavailable, so Orbit used its built-in parser.', ...draft.notes] });
      }
    }
    if (!input.text?.trim()) {
      throw new HttpError(400, 'No text could be read from this file (it may be a scan or a photo). Paste the syllabus text instead, or ask the server admin to set ANTHROPIC_API_KEY to read scans.');
    }
    res.json(parseSyllabus(input.text, today, { fileName: input.fileName }));
  }),
);

importRouter.post(
  '/import/apply',
  handler(async (req, res) => {
    const draft = body(req, draftSchema);
    res.json(
      await mutate(req, (snap) => {
        const c = applyImport(snap, draft, now().toISOString());
        if (!c.subjects && !c.topics && !c.exams) throw new HttpError(400, 'Everything in this import is already in Orbit.');
        return { explanation: [`Added ${plural(c.subjects, 'subject')}, ${plural(c.topics, 'topic')} and ${plural(c.exams, 'exam')}.`] };
      }),
    );
  }),
);
