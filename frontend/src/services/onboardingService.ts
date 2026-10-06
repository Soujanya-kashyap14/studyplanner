import type { MutationResponse, SetupPayload, Subject, Topic, Exam } from '@/types';
import { USE_MOCK } from '@/config/api';
import { http, json } from '@/lib/http';
import { uid } from '@/lib/utils';
import { now } from '@/lib/clock';
import { mockMutation } from './mock/mutation';
import { generatePlan } from '@/utils/scheduler';

/**
 * Guided setup: everything the wizard collected, saved in one call, and the
 * first plan generated straight away so the user lands on a real schedule.
 */
export const onboardingService = {
  /** POST /setup  body: SetupPayload → MutationResponse (with the generated plan) */
  async completeSetup(payload: SetupPayload): Promise<MutationResponse> {
    if (!USE_MOCK) return http('/setup', { method: 'POST', ...json(payload) });
    return mockMutation((snap, input) => {
      const created = now().toISOString();
      const subjectIds: string[] = [];
      const topicIdsBySubject: string[][] = [];
      for (const s of payload.subjects) {
        const subject: Subject = { id: uid('sub'), name: s.name, color: s.color, difficulty: s.difficulty, createdAt: created };
        const topics: Topic[] = s.topics.map((t, order) => ({
          id: uid('top'),
          subjectId: subject.id,
          name: t.name,
          difficulty: t.difficulty,
          estimatedHours: t.estimatedHours,
          completedHours: 0,
          status: 'not_started',
          order,
        }));
        snap.subjects.push(subject);
        snap.topics.push(...topics);
        subjectIds.push(subject.id);
        topicIdsBySubject.push(topics.map((t) => t.id));
      }
      for (const dl of payload.deadlines) {
        const subjectId = subjectIds[dl.subjectIndex];
        if (!subjectId) continue;
        if (dl.kind === 'exam') {
          const exam: Exam = { id: uid('exm'), subjectId, title: dl.title, date: dl.date, topicIds: topicIdsBySubject[dl.subjectIndex] };
          snap.exams.push(exam);
        } else {
          snap.assignments.push({ id: uid('asg'), subjectId, title: dl.title, dueDate: dl.date, status: 'todo' });
        }
      }
      snap.availability = payload.availability;
      snap.planStale = false;
      return { result: generatePlan(input()), trigger: 'Plan generated' };
    });
  },
};
