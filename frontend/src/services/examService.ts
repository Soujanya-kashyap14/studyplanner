import type { Assignment, AssignmentStatus, Exam, ID, MutationResponse } from '@/types';
import { USE_MOCK } from '@/config/api';
import { http, json } from '@/lib/http';
import { uid } from '@/lib/utils';
import { mockMutation } from './mock/mutation';

export type ExamInput = Omit<Exam, 'id'>;
export type AssignmentInput = Omit<Assignment, 'id'>;

export const examService = {
  /** POST /exams  body: ExamInput */
  async createExam(input: ExamInput): Promise<MutationResponse> {
    if (!USE_MOCK) return http('/exams', { method: 'POST', ...json(input) });
    return mockMutation((snap) => {
      snap.planStale = true; // the plan no longer reflects this data
      snap.exams.push({ id: uid('exm'), ...input });
    });
  },

  /** PATCH /exams/:id  body: Partial<ExamInput> */
  async updateExam(id: ID, patch: Partial<ExamInput>): Promise<MutationResponse> {
    if (!USE_MOCK) return http(`/exams/${id}`, { method: 'PATCH', ...json(patch) });
    return mockMutation((snap) => {
      snap.planStale = true; // the plan no longer reflects this data
      snap.exams = snap.exams.map((e) => (e.id === id ? { ...e, ...patch } : e));
    });
  },

  /** DELETE /exams/:id */
  async deleteExam(id: ID): Promise<MutationResponse> {
    if (!USE_MOCK) return http(`/exams/${id}`, { method: 'DELETE' });
    return mockMutation((snap) => {
      snap.planStale = true; // the plan no longer reflects this data
      snap.exams = snap.exams.filter((e) => e.id !== id);
    });
  },

  /** POST /assignments  body: AssignmentInput */
  async createAssignment(input: AssignmentInput): Promise<MutationResponse> {
    if (!USE_MOCK) return http('/assignments', { method: 'POST', ...json(input) });
    return mockMutation((snap) => {
      snap.planStale = true; // the plan no longer reflects this data
      snap.assignments.push({ id: uid('asg'), ...input });
    });
  },

  /** PATCH /assignments/:id  body: Partial<AssignmentInput> */
  async updateAssignment(id: ID, patch: Partial<AssignmentInput>): Promise<MutationResponse> {
    if (!USE_MOCK) return http(`/assignments/${id}`, { method: 'PATCH', ...json(patch) });
    return mockMutation((snap) => {
      snap.planStale = true; // the plan no longer reflects this data
      snap.assignments = snap.assignments.map((a) => (a.id === id ? { ...a, ...patch } : a));
    });
  },

  /** PATCH /assignments/:id  body: { status } */
  async setAssignmentStatus(id: ID, status: AssignmentStatus): Promise<MutationResponse> {
    return examService.updateAssignment(id, { status });
  },

  /** DELETE /assignments/:id */
  async deleteAssignment(id: ID): Promise<MutationResponse> {
    if (!USE_MOCK) return http(`/assignments/${id}`, { method: 'DELETE' });
    return mockMutation((snap) => {
      snap.planStale = true; // the plan no longer reflects this data
      snap.assignments = snap.assignments.filter((a) => a.id !== id);
    });
  },
};
