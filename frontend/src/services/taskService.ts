import type { ID, MutationResponse, SessionStatus } from '@/types';
import { USE_MOCK } from '@/config/api';
import { http, json } from '@/lib/http';
import { now } from '@/lib/clock';
import { round1 } from '@/lib/utils';
import { mockMutation } from './mock/mutation';
import { rescheduleAfterCompletion, rescheduleMissed } from '@/utils/scheduler';

/**
 * Task tracking: sessions move through planned -> in_progress -> completed | missed.
 * The backend runs the scheduler on a miss or early finish and returns the change list.
 */
export const taskService = {
  /**
   * PUT /sessions/:id/status  body: { status, actualMin? }
   * - missed     -> the session reflows to the next free slot before its deadline
   * - completed  -> topic hours update; an early finish / finished topic pulls work forward
   */
  async updateSessionStatus(id: ID, status: SessionStatus, actualMin?: number): Promise<MutationResponse> {
    if (!USE_MOCK) return http(`/sessions/${id}/status`, { method: 'PUT', ...json({ status, actualMin }) });

    return mockMutation((snap, input) => {
      const session = snap.sessions.find((s) => s.id === id);
      if (!session) throw new Error('Session not found');

      if (status === 'missed') {
        return { result: rescheduleMissed(input(), [id]), trigger: 'Missed session' };
      }

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
          return {
            ...t,
            completedHours: Math.min(completedHours, t.estimatedHours),
            status: topicDone ? 'completed' : 'in_progress',
            completedAt: topicDone ? now().toISOString() : t.completedAt,
          };
        });
        const early = minutes < session.durationMin;
        if (early || topicDone) {
          return {
            result: rescheduleAfterCompletion(input(), id, topicDone),
            trigger: topicDone ? 'Topic complete' : 'Finished early',
          };
        }
        return;
      }

      // in_progress, or back to planned (undo)
      session.status = status;
      if (status === 'planned') {
        session.actualMin = undefined;
        session.completedAt = undefined;
      }
      if (status === 'in_progress') {
        snap.topics = snap.topics.map((t) => (t.id === session.topicId && t.status === 'not_started' ? { ...t, status: 'in_progress' } : t));
      }
    });
  },
};
