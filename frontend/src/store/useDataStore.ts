import { create } from 'zustand';
import type {
  AchievementInput,
  Availability,
  ImportDraft,
  SetupPayload,
  ChangeLog,
  ID,
  Mood,
  MutationResponse,
  SessionStatus,
  SlotRef,
  Snapshot,
  TopicStatus,
} from '@/types';
import { achievementService, examService, importService, onboardingService, progressService, scheduleService, subjectService, taskService } from '@/services';
import type { SubjectInput, TopicInput } from '@/services/subjectService';
import type { AssignmentInput, ExamInput } from '@/services/examService';
import { toast, useUIStore } from './useUIStore';
import { describeLog } from '@/utils/planUpdates';
import { todayISO } from '@/lib/date';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface DataState {
  snapshot: Snapshot | null;
  status: LoadStatus;
  error: string | null;
  /** Ids touched by the latest reflow — the calendar makes them glow. */
  highlight: { ids: ID[]; at: number };
  /** Latest change log entry, shown in the "What changed" panel. */
  lastLog: ChangeLog | null;
  /** Ids with an in-flight mutation (for spinners / disabled states). */
  pending: Record<string, boolean>;

  load: () => Promise<void>;
  clear: () => void;
  resetDemo: () => Promise<void>;
  /** Wipe all data and start over with guided setup. */
  clearData: () => Promise<boolean>;
  /** Save everything from the setup wizard and build the first plan. */
  completeSetup: (p: SetupPayload) => Promise<boolean>;

  createSubject: (i: SubjectInput) => Promise<boolean>;
  updateSubject: (id: ID, p: Partial<SubjectInput>) => Promise<boolean>;
  deleteSubject: (id: ID) => Promise<boolean>;
  createTopic: (subjectId: ID, i: TopicInput) => Promise<boolean>;
  updateTopic: (id: ID, p: Partial<TopicInput>) => Promise<boolean>;
  deleteTopic: (id: ID) => Promise<boolean>;
  setTopicStatus: (id: ID, s: TopicStatus) => Promise<boolean>;

  createExam: (i: ExamInput) => Promise<boolean>;
  updateExam: (id: ID, p: Partial<ExamInput>) => Promise<boolean>;
  deleteExam: (id: ID) => Promise<boolean>;
  createAssignment: (i: AssignmentInput) => Promise<boolean>;
  updateAssignment: (id: ID, p: Partial<AssignmentInput>) => Promise<boolean>;
  deleteAssignment: (id: ID) => Promise<boolean>;

  createAchievement: (a: AchievementInput) => Promise<boolean>;
  updateAchievement: (id: ID, p: Partial<AchievementInput>) => Promise<boolean>;
  deleteAchievement: (id: ID) => Promise<boolean>;

  updateAvailability: (a: Availability) => Promise<boolean>;
  generatePlan: (opts?: { ai?: boolean }) => Promise<boolean>;
  setSessionStatus: (id: ID, status: SessionStatus, actualMin?: number) => Promise<MutationResponse | null>;
  moveSession: (id: ID, to: SlotRef) => Promise<boolean>;
  checkInMood: (mood: Mood) => Promise<string[] | null>;
  rollover: () => Promise<boolean>;
  addExtraSession: (subjectId: ID) => Promise<boolean>;
  simulateMiss: () => Promise<boolean>;
  /** Save a reviewed syllabus import (subjects, topics, exams). */
  applyImport: (draft: Pick<ImportDraft, 'subjects' | 'exams'>) => Promise<boolean>;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

export const useDataStore = create<DataState>((set, get) => {
  /** Apply a mutation response: new snapshot, highlight, change log, toast, achievements. */
  /** Restore the state from before an action ("Undo" on toasts). */
  async function undo(prev: Snapshot) {
    try {
      const snapshot = await progressService.restoreSnapshot(prev);
      set({ snapshot, lastLog: snapshot.changeLog[0] ?? null, highlight: { ids: [], at: 0 } });
      toast({ tone: 'info', title: 'Undone', description: 'Everything is back the way it was.' });
    } catch (e) {
      toast({ tone: 'danger', title: "Couldn't undo", description: errMsg(e) });
    }
  }

  /** Apply a mutation response: new snapshot, highlight, plan update, toast (with Undo), achievements. */
  function apply(res: MutationResponse, opts: { success?: string; silent?: boolean; prev?: Snapshot | null; noUndo?: boolean } = {}) {
    const touched = res.log?.changes.map((c) => c.sessionId) ?? [];
    set({
      snapshot: res.snapshot,
      highlight: touched.length ? { ids: touched, at: Date.now() } : get().highlight,
      lastLog: res.log ?? get().lastLog,
    });
    const undoAction = opts.prev && !opts.noUndo ? [{ label: 'Undo', onClick: () => void undo(opts.prev!) }] : [];

    if (res.log && !opts.silent) {
      const described = describeLog(res.log, res.snapshot);
      const changed = res.log.changes.length > 0;
      const openUpdates = () => {
        if (window.location.pathname.startsWith('/plan')) window.dispatchEvent(new CustomEvent('orbit:open-updates'));
        else window.dispatchEvent(new CustomEvent('orbit:navigate', { detail: '/plan?changes=1' }));
      };
      toast({
        tone: res.log.warnings.length ? 'warning' : 'info',
        title: described.headline,
        description: described.warnings[0],
        action: changed ? { label: 'See plan updates', onClick: openUpdates } : undefined,
        actions: undoAction,
      });
    } else if (opts.success) {
      toast({ tone: 'success', title: opts.success, actions: undoAction });
    }
  }

  /** Run a mutation with pending flags + error toasts. Returns success. */
  async function run(key: string, fn: () => Promise<MutationResponse>, opts?: { success?: string; silent?: boolean; noUndo?: boolean; prev?: Snapshot | null }) {
    const prev = opts?.prev ?? get().snapshot;
    set((s) => ({ pending: { ...s.pending, [key]: true } }));
    try {
      const res = await fn();
      apply(res, { ...opts, prev });
      return res;
    } catch (e) {
      toast({ tone: 'danger', title: "That didn't go through", description: errMsg(e) });
      return null;
    } finally {
      set((s) => {
        const pending = { ...s.pending };
        delete pending[key];
        return { pending };
      });
    }
  }
  const ok = async (...args: Parameters<typeof run>) => (await run(...args)) !== null;

  return {
    snapshot: null,
    status: 'idle',
    error: null,
    highlight: { ids: [], at: 0 },
    lastLog: null,
    pending: {},

    load: async () => {
      set({ status: 'loading', error: null });
      try {
        const snapshot = await progressService.getSnapshot();
        set({ snapshot, status: 'ready', lastLog: snapshot.changeLog[0] ?? null });
          } catch (e) {
        set({ status: 'error', error: errMsg(e) });
      }
    },
    clear: () => set({ snapshot: null, status: 'idle', lastLog: null, highlight: { ids: [], at: 0 } }),
    resetDemo: async () => {
      set({ status: 'loading' });
      try {
        useUIStore.getState().resetClock();
        const snapshot = await progressService.resetDemoData();
        set({ snapshot, status: 'ready', lastLog: null, highlight: { ids: [], at: 0 } });
        toast({ tone: 'success', title: 'Demo data restored', description: 'Fresh sky, fresh plan.' });
      } catch (e) {
        set({ status: 'error', error: errMsg(e) });
      }
    },

    clearData: async () => {
      try {
        useUIStore.getState().resetClock();
        const snapshot = await progressService.clearData();
        set({ snapshot, status: 'ready', lastLog: null, highlight: { ids: [], at: 0 } });
        return true;
      } catch (e) {
        toast({ tone: 'danger', title: 'Could not clear your data', description: errMsg(e) });
        return false;
      }
    },
    completeSetup: (p) => ok('setup', () => onboardingService.completeSetup(p), { silent: true, noUndo: true }),

    createSubject: (i) => ok('subject:new', () => subjectService.createSubject(i), { success: `${i.name} added to your sky` }),
    updateSubject: (id, p) => ok(`subject:${id}`, () => subjectService.updateSubject(id, p), { success: 'Subject updated' }),
    deleteSubject: (id) => ok(`subject:${id}`, () => subjectService.deleteSubject(id), { success: 'Subject removed' }),
    createTopic: (sid, i) => ok(`topic:new:${sid}`, () => subjectService.createTopic(sid, i), { success: `New star: ${i.name}` }),
    updateTopic: (id, p) => ok(`topic:${id}`, () => subjectService.updateTopic(id, p), { success: 'Topic updated' }),
    deleteTopic: (id) => ok(`topic:${id}`, () => subjectService.deleteTopic(id), { success: 'Topic removed' }),
    setTopicStatus: async (id, status) => {
      // Optimistic: flip the star immediately.
      const prev = get().snapshot;
      if (prev) set({ snapshot: { ...prev, topics: prev.topics.map((t) => (t.id === id ? { ...t, status } : t)) } });
      const success = await ok(`topic:${id}`, () => subjectService.setTopicStatus(id, status), {
        prev,
        success: status === 'completed' ? 'Star lit ✦' : status === 'in_progress' ? 'Marked in progress' : 'Status updated',
      });
      if (!success && prev) set({ snapshot: prev });
      return success;
    },

    createExam: (i) => ok('exam:new', () => examService.createExam(i), { success: 'Exam added' }),
    updateExam: (id, p) => ok(`exam:${id}`, () => examService.updateExam(id, p), { success: 'Exam updated' }),
    deleteExam: (id) => ok(`exam:${id}`, () => examService.deleteExam(id), { success: 'Exam removed' }),
    createAssignment: (i) => ok('asg:new', () => examService.createAssignment(i), { success: 'Assignment added' }),
    updateAssignment: (id, p) => ok(`asg:${id}`, () => examService.updateAssignment(id, p), { success: 'Assignment updated' }),
    deleteAssignment: (id) => ok(`asg:${id}`, () => examService.deleteAssignment(id), { success: 'Assignment removed' }),

    createAchievement: (a) => ok('ach:new', () => achievementService.create(a), { success: `Achievement added: ${a.title}` }),
    updateAchievement: (id, p) => ok(`ach:${id}`, () => achievementService.update(id, p), { success: 'Achievement updated' }),
    deleteAchievement: (id) => ok(`ach:${id}`, () => achievementService.remove(id), { success: 'Achievement removed' }),

    updateAvailability: (a) => ok('availability', () => scheduleService.updateAvailability(a), { success: 'Study hours saved — every session still fits' }),
    generatePlan: (opts) => ok('generate', () => (opts?.ai ? scheduleService.generateAIStudyPlan() : scheduleService.generatePlan())),

    setSessionStatus: async (id, status, actualMin) => {
      // Optimistic UI: show the new status instantly, roll back on failure.
      const prev = get().snapshot;
      if (prev) {
        set({ snapshot: { ...prev, sessions: prev.sessions.map((s) => (s.id === id ? { ...s, status, actualMin: actualMin ?? s.actualMin } : s)) } });
      }
      const success =
        status === 'completed' ? 'Session complete — star brightened ✦' : status === 'in_progress' ? 'Session started' : status === 'planned' ? 'Status cleared' : undefined;
      const res = await run(`session:${id}`, () => taskService.updateSessionStatus(id, status, actualMin), { success, prev });
      if (!res && prev) set({ snapshot: prev });
      return res;
    },
    moveSession: (id, to) => ok(`session:${id}`, () => scheduleService.moveSession(id, to)),
    checkInMood: async (mood) => {
      const res = await run('mood', () => scheduleService.checkInMood(mood), { silent: true });
      useUIStore.getState().setMoodHandled(todayISO());
      return res?.explanation ?? null;
    },
    rollover: () => ok('rollover', () => scheduleService.rollover()),
    addExtraSession: (subjectId) => ok(`extra:${subjectId}`, () => scheduleService.addExtraSession(subjectId)),
    simulateMiss: () => ok('simulate', () => scheduleService.simulateMiss()),
    applyImport: async (draft) => {
      const res = await run('import', () => importService.apply(draft), { silent: true });
      if (res) toast({ tone: 'success', title: 'Syllabus imported', description: `${res.explanation?.[0] ?? 'Done.'} Generate your plan to schedule them.` });
      return res !== null;
    },
  };
});
