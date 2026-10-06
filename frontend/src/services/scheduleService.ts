import type { Availability, ID, Mood, MutationResponse, SlotRef } from '@/types';
import { USE_MOCK } from '@/config/api';
import { http, json } from '@/lib/http';
import { now } from '@/lib/clock';
import { formatWeekday, todayISO } from '@/lib/date';
import { planRestDay } from '@/utils/insights';
import { mockMutation } from './mock/mutation';
import {
  addExtraSession,
  applyMood,
  generatePlan,
  moveSession,
  rankTopics,
  reflowForAvailability,
  rescheduleMissed,
  rolloverPastSessions,
} from '@/utils/scheduler';

export const scheduleService = {
  /**
   * PUT /availability  body: Availability
   * Saves the hours and re-fits the existing plan into them ("Save & update plan").
   */
  async updateAvailability(availability: Availability): Promise<MutationResponse> {
    if (!USE_MOCK) return http('/availability', { method: 'PUT', ...json(availability) });
    return mockMutation((snap, input) => {
      // Buffer days only apply when the plan is generated, so changing them asks for a fresh plan.
      if ((snap.availability.bufferBeforeExams !== false) !== (availability.bufferBeforeExams !== false)) snap.planStale = true;
      snap.availability = availability;
      const hasPlan = snap.sessions.some((s) => s.status === 'planned' && s.date >= input().today);
      if (hasPlan) return { result: reflowForAvailability(input()), trigger: 'Study hours changed' };
      snap.planStale = true;
    });
  },

  /** POST /schedule/generate — rule-based plan from today. */
  async generatePlan(): Promise<MutationResponse> {
    if (!USE_MOCK) return http('/schedule/generate', { method: 'POST' });
    return mockMutation((snap, input) => {
      snap.planStale = false;
      return { result: generatePlan(input()), trigger: 'Plan generated' };
    });
  },

  /**
   * ⚡ AI INTEGRATION PLACEHOLDER
   * POST /schedule/generate-ai
   * Later: the backend sends the snapshot (topics, deadlines, history, mood) to an LLM
   * that proposes a plan, then validates it with the same scheduler rules
   * (availability, session length, deadlines) before returning it.
   * For now it falls back to the deterministic scheduler.
   */
  async generateAIStudyPlan(): Promise<MutationResponse> {
    if (!USE_MOCK) return http('/schedule/generate-ai', { method: 'POST' });
    // TODO(ai): replace with `http('/schedule/generate-ai')` once the AI endpoint exists.
    return scheduleService.generatePlan();
  },

  /**
   * PUT /sessions/:id/move  body: SlotRef { date, start }
   * Manual drag-and-drop. The session is locked in place; neighbours reflow and
   * deadlines are re-validated (warnings returned in result.warnings).
   */
  async moveSession(id: ID, to: SlotRef): Promise<MutationResponse> {
    if (!USE_MOCK) return http(`/sessions/${id}/move`, { method: 'PUT', ...json(to) });
    return mockMutation((_snap, input) => ({ result: moveSession(input(), id, to), trigger: 'Manual move' }));
  },

  /**
   * POST /mood  body: { mood }
   * Saves today's check-in and adapts today's load. Returns plain-language explanation lines.
   */
  async checkInMood(mood: Mood): Promise<MutationResponse> {
    if (!USE_MOCK) return http('/mood', { method: 'POST', ...json({ mood }) });
    return mockMutation((snap, input) => {
      const today = todayISO();
      // Burnout guard: repeated low energy or a long heavy run earns a rest day.
      const rest = planRestDay({ today, mood, moods: snap.moods, sessions: snap.sessions, exams: snap.exams, availability: snap.availability });
      if (rest) snap.availability = { ...snap.availability, overrides: [...snap.availability.overrides.filter((o) => o.date !== rest.override.date), rest.override] };
      // Adapt using the previous state, then store the new mood.
      const base = input();
      const res = applyMood({ ...base, mood: undefined }, mood);
      snap.moods = [...snap.moods.filter((m) => m.date !== today), { date: today, mood, createdAt: now().toISOString() }];
      const explanation = rest
        ? [...res.explanation, `Burnout guard: ${rest.reasons.join(' ')} ${formatWeekday(rest.override.date)} is now a rest day — its sessions moved to other days.`]
        : res.explanation;
      return { result: res, trigger: 'Mood check-in', explanation };
    });
  },

  /**
   * POST /schedule/rollover
   * Called when the day changes (or Demo Mode fast-forwards): every planned
   * session in the past is marked missed and reflowed.
   */
  async rollover(): Promise<MutationResponse> {
    if (!USE_MOCK) return http('/schedule/rollover', { method: 'POST' });
    return mockMutation((_snap, input) => ({ result: rolloverPastSessions(input()), trigger: 'New day' }));
  },

  /** POST /schedule/extra-session  body: { subjectId, minutes? } — from Smart Suggestions. */
  async addExtraSession(subjectId: ID, minutes?: number): Promise<MutationResponse> {
    if (!USE_MOCK) return http('/schedule/extra-session', { method: 'POST', ...json({ subjectId, minutes }) });
    return mockMutation((_snap, input) => {
      const inp = input();
      const top = rankTopics(inp).find((r) => r.topic.subjectId === subjectId);
      if (!top) throw new Error('This subject has no open topics left.');
      return { result: addExtraSession(inp, top.topic.id, minutes), trigger: 'Extra session' };
    });
  },

  /**
   * DEMO ONLY — POST /demo/simulate-miss
   * Marks the next upcoming planned session as missed to show the Living Schedule reflow.
   */
  async simulateMiss(): Promise<MutationResponse> {
    if (!USE_MOCK) return http('/demo/simulate-miss', { method: 'POST' });
    return mockMutation((snap, input) => {
      const today = todayISO();
      const next = snap.sessions
        .filter((s) => s.status === 'planned' && s.date >= today)
        .sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1))[0];
      if (!next) throw new Error('No upcoming sessions to miss. Generate a plan first.');
      return { result: rescheduleMissed(input(), [next.id]), trigger: 'Missed session' };
    });
  },
};
