import type { AchievementInput, ID, MutationResponse } from '@/types';
import { USE_MOCK } from '@/config/api';
import { http, json } from '@/lib/http';
import { uid } from '@/lib/utils';
import { now } from '@/lib/clock';
import { mockMutation } from './mock/mutation';

/** The student's own achievements (good marks, passed all subjects, awards…). */
export const achievementService = {
  /** POST /achievements  body: AchievementInput */
  async create(input: AchievementInput): Promise<MutationResponse> {
    if (!USE_MOCK) return http('/achievements', { method: 'POST', ...json(input) });
    return mockMutation((snap) => {
      snap.achievements.push({ id: uid('ach'), ...input, createdAt: now().toISOString() });
    });
  },

  /** PATCH /achievements/:id  body: Partial<AchievementInput> */
  async update(id: ID, patch: Partial<AchievementInput>): Promise<MutationResponse> {
    if (!USE_MOCK) return http(`/achievements/${id}`, { method: 'PATCH', ...json(patch) });
    return mockMutation((snap) => {
      snap.achievements = snap.achievements.map((a) => (a.id === id ? { ...a, ...patch } : a));
    });
  },

  /** DELETE /achievements/:id */
  async remove(id: ID): Promise<MutationResponse> {
    if (!USE_MOCK) return http(`/achievements/${id}`, { method: 'DELETE' });
    return mockMutation((snap) => {
      snap.achievements = snap.achievements.filter((a) => a.id !== id);
    });
  },
};
