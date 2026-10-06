import type { Difficulty, ID, MutationResponse, Subject, Topic, TopicStatus } from '@/types';
import { USE_MOCK } from '@/config/api';
import { http, json } from '@/lib/http';
import { uid } from '@/lib/utils';
import { now } from '@/lib/clock';
import { mockMutation } from './mock/mutation';
import { rescheduleTopicCompleted } from '@/utils/scheduler';

export type SubjectInput = Pick<Subject, 'name' | 'color' | 'difficulty'>;
export type TopicInput = Pick<Topic, 'name' | 'difficulty' | 'estimatedHours'> & { status?: TopicStatus; deadline?: string; weightage?: number; frequentlyAsked?: boolean };

export const subjectService = {
  /** POST /subjects  body: SubjectInput */
  async createSubject(input: SubjectInput): Promise<MutationResponse> {
    if (!USE_MOCK) return http('/subjects', { method: 'POST', ...json(input) });
    return mockMutation((snap) => {
      snap.planStale = true; // the plan no longer reflects this data
      snap.subjects.push({ id: uid('sub'), ...input, createdAt: now().toISOString() });
    });
  },

  /** PATCH /subjects/:id  body: Partial<SubjectInput> */
  async updateSubject(id: ID, patch: Partial<SubjectInput>): Promise<MutationResponse> {
    if (!USE_MOCK) return http(`/subjects/${id}`, { method: 'PATCH', ...json(patch) });
    return mockMutation((snap) => {
      snap.planStale = true; // the plan no longer reflects this data
      snap.subjects = snap.subjects.map((s) => (s.id === id ? { ...s, ...patch } : s));
    });
  },

  /** DELETE /subjects/:id — cascades to topics, exams, assignments and sessions. */
  async deleteSubject(id: ID): Promise<MutationResponse> {
    if (!USE_MOCK) return http(`/subjects/${id}`, { method: 'DELETE' });
    return mockMutation((snap) => {
      snap.planStale = true; // the plan no longer reflects this data
      snap.subjects = snap.subjects.filter((s) => s.id !== id);
      snap.topics = snap.topics.filter((t) => t.subjectId !== id);
      snap.exams = snap.exams.filter((e) => e.subjectId !== id);
      snap.assignments = snap.assignments.filter((a) => a.subjectId !== id);
      snap.sessions = snap.sessions.filter((s) => s.subjectId !== id);
    });
  },

  /** POST /subjects/:subjectId/topics  body: TopicInput */
  async createTopic(subjectId: ID, input: TopicInput): Promise<MutationResponse> {
    if (!USE_MOCK) return http(`/subjects/${subjectId}/topics`, { method: 'POST', ...json(input) });
    return mockMutation((snap) => {
      snap.planStale = true; // the plan no longer reflects this data
      const order = snap.topics.filter((t) => t.subjectId === subjectId).length;
      snap.topics.push({
        id: uid('top'),
        subjectId,
        name: input.name,
        difficulty: input.difficulty as Difficulty,
        estimatedHours: input.estimatedHours,
        completedHours: 0,
        status: input.status ?? 'not_started',
        deadline: input.deadline,
        order,
        weightage: input.weightage || undefined,
        frequentlyAsked: input.frequentlyAsked || undefined,
      });
    });
  },

  /** PATCH /topics/:id  body: Partial<TopicInput> */
  async updateTopic(id: ID, patch: Partial<TopicInput>): Promise<MutationResponse> {
    if (!USE_MOCK) return http(`/topics/${id}`, { method: 'PATCH', ...json(patch) });
    return mockMutation((snap) => {
      snap.planStale = true; // the plan no longer reflects this data
      snap.topics = snap.topics.map((t) =>
        t.id === id ? { ...t, ...patch, weightage: (patch.weightage ?? t.weightage) || undefined, frequentlyAsked: (patch.frequentlyAsked ?? t.frequentlyAsked) || undefined } : t,
      );
    });
  },

  /** DELETE /topics/:id — also removes its sessions and exam links. */
  async deleteTopic(id: ID): Promise<MutationResponse> {
    if (!USE_MOCK) return http(`/topics/${id}`, { method: 'DELETE' });
    return mockMutation((snap) => {
      snap.planStale = true; // the plan no longer reflects this data
      snap.topics = snap.topics.filter((t) => t.id !== id);
      snap.sessions = snap.sessions.filter((s) => s.topicId !== id);
      snap.exams = snap.exams.map((e) => ({ ...e, topicIds: e.topicIds.filter((x) => x !== id) }));
    });
  },

  /**
   * PUT /topics/:id/status  body: { status }
   * Completing a topic removes its remaining sessions and pulls later work forward.
   */
  async setTopicStatus(id: ID, status: TopicStatus): Promise<MutationResponse> {
    if (!USE_MOCK) return http(`/topics/${id}/status`, { method: 'PUT', ...json({ status }) });
    return mockMutation((snap, input) => {
      snap.topics = snap.topics.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              completedHours: status === 'completed' ? Math.max(t.completedHours, t.estimatedHours) : t.completedHours,
              completedAt: status === 'completed' ? now().toISOString() : undefined,
            }
          : t,
      );
      if (status === 'completed') return { result: rescheduleTopicCompleted(input(), id), trigger: 'Topic complete' };
    });
  },
};
