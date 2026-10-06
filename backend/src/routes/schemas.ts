import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 18:30.');

export const availabilitySchema = z.object({
  weekly: z.array(z.object({ weekday: z.number().int().min(0).max(6), hours: z.number().min(0).max(16), startTime: time })).max(7),
  overrides: z
    .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hours: z.number().min(0).max(16), startTime: time, note: z.string().max(40).optional(), source: z.enum(['burnout_guard']).optional() }))
    .max(366)
    .default([]),
  bufferBeforeExams: z.boolean().optional(),
  burnoutGuard: z.boolean().optional(),
});

export const slotSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-14.'), start: time });
