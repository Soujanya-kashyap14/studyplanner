/**
 * Orbit domain types.
 * These mirror the JSON contracts the backend must implement (see README).
 * Dates: `ISODate` = 'YYYY-MM-DD' (local calendar day), `ISODateTime` = full ISO string.
 * Times of day: 'HH:mm' (24h).
 */

export type ID = string;
export type ISODate = string;
export type ISODateTime = string;
export type TimeOfDay = string;

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export interface User {
  id: ID;
  name: string;
  email: string;
  /** Preferred focused session length in minutes (e.g. 25, 50). */
  preferredSessionMinutes: number;
  /** Short break between back-to-back sessions, in minutes. */
  breakMinutes: number;
  createdAt: ISODateTime;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Subject {
  id: ID;
  name: string;
  /** Signature color (hex) used for stars, calendar blocks, charts and badges. */
  color: string;
  difficulty: Difficulty;
  createdAt: ISODateTime;
}

export type TopicStatus = 'not_started' | 'in_progress' | 'completed';

export interface Topic {
  id: ID;
  subjectId: ID;
  name: string;
  difficulty: Difficulty;
  estimatedHours: number;
  /** Hours actually studied so far (from completed sessions). */
  completedHours: number;
  status: TopicStatus;
  /** Optional explicit deadline; otherwise derived from linked exams/assignments. */
  deadline?: ISODate;
  order: number;
  completedAt?: ISODateTime;
  /** Share of the exam's marks this topic carries (0-100). Higher-scoring topics get priority. */
  weightage?: number;
  /** Marked as frequently asked in previous-year papers — weighted higher by the planner. */
  frequentlyAsked?: boolean;
}

export interface Exam {
  id: ID;
  subjectId: ID;
  title: string;
  /** Exam start, local datetime ISO string. */
  date: ISODateTime;
  /** Topics this exam covers. Their deadline becomes the exam date. */
  topicIds: ID[];
  location?: string;
}

export type AssignmentStatus = 'todo' | 'in_progress' | 'done';

export interface Assignment {
  id: ID;
  subjectId: ID;
  title: string;
  dueDate: ISODateTime;
  status: AssignmentStatus;
  /** Optional topic the assignment exercises (gives that topic a deadline). */
  topicId?: ID;
}

export type SessionStatus = 'planned' | 'in_progress' | 'completed' | 'missed';

export interface StudySession {
  id: ID;
  topicId: ID;
  subjectId: ID;
  date: ISODate;
  start: TimeOfDay;
  durationMin: number;
  status: SessionStatus;
  /** Minutes actually studied (set when completed). */
  actualMin?: number;
  /** 'auto' = placed by the scheduler, 'manual' = user dragged it (locked in place). */
  source: 'auto' | 'manual';
  locked?: boolean;
  /** Scheduler flag: this session lands after (or dangerously close to) its deadline. */
  atRisk?: boolean;
  /** Present on a missed record: id of the session that replaced it. */
  rescheduledTo?: ID;
  completedAt?: ISODateTime;
  /** 'revision' = spaced-repetition review of a finished topic (does not add study hours). Default 'study'. */
  kind?: 'study' | 'revision';
  /** For revisions: days after completion this review belongs to (1, 3, 7 or 21). */
  revisionStep?: number;
}

export interface DailyAvailability {
  /** 0 = Sunday ... 6 = Saturday (JS Date#getDay). */
  weekday: number;
  hours: number;
  startTime: TimeOfDay;
}

export interface AvailabilityOverride {
  date: ISODate;
  hours: number;
  startTime: TimeOfDay;
  note?: string;
  /** Set when Orbit inserted this exception itself (e.g. a burnout-guard rest day). */
  source?: 'burnout_guard';
}

export interface Availability {
  weekly: DailyAvailability[];
  overrides: AvailabilityOverride[];
  /** Keep the day before each exam free of new work, as a catch-up day. Default on. */
  bufferBeforeExams?: boolean;
  /** Insert a rest day after repeated low-energy check-ins or a long run of heavy days. Default on. */
  burnoutGuard?: boolean;
}

export type Mood = 'energized' | 'okay' | 'drained';

export interface MoodCheckIn {
  date: ISODate;
  mood: Mood;
  createdAt: ISODateTime;
}

export type AchievementCategory = 'grades' | 'exam' | 'subjects' | 'award' | 'project' | 'other';

/** Something the student achieved and chose to record (good marks, passed all subjects…). */
export interface Achievement {
  id: ID;
  title: string;
  category: AchievementCategory;
  /** Day it happened. */
  date: ISODate;
  /** Optional subject it belongs to. */
  subjectId?: ID;
  /** Optional result, e.g. "A+", "92%", "1st place". */
  result?: string;
  note?: string;
  createdAt: ISODateTime;
}

export type AchievementInput = Omit<Achievement, 'id' | 'createdAt'>;

/* ---------- Scheduler contracts ---------- */

export type ChangeKind = 'moved' | 'added' | 'removed' | 'shortened' | 'flagged';

export interface SlotRef {
  date: ISODate;
  start: TimeOfDay;
}

/** One entry in the "What changed" panel. */
export interface ScheduleChange {
  sessionId: ID;
  topicId: ID;
  subjectId: ID;
  kind: ChangeKind;
  from: SlotRef | null;
  to: SlotRef | null;
  reason: string;
}

export interface ScheduleWarning {
  topicId: ID;
  message: string;
  severity: 'info' | 'warning' | 'danger';
}

export interface ScheduleResult {
  sessions: StudySession[];
  changes: ScheduleChange[];
  warnings: ScheduleWarning[];
  /** One-line human summary, used for toasts. */
  summary: string;
}

export interface ChangeLog {
  id: ID;
  createdAt: ISODateTime;
  trigger: string;
  summary: string;
  changes: ScheduleChange[];
  warnings: ScheduleWarning[];
}

export interface ReadinessPrediction {
  examId: ID;
  readiness: number; // 0..100
  coverage: number; // 0..1 completed now
  projectedCoverage: number; // 0..1 by exam day if plan is followed at historic rate
  daysLeft: number;
  risk: 'on_track' | 'some_risk' | 'at_risk';
  message: string;
}

export interface Suggestion {
  id: ID;
  subjectId: ID;
  title: string;
  detail: string;
  extraMinutesPerWeek: number;
  severity: 'info' | 'warning' | 'danger';
}

export interface DailyBriefing {
  greeting: string;
  lines: string[];
  generatedBy: 'rules' | 'ai';
}

/** Everything the dashboard needs, as one payload (GET /me/snapshot). */
export interface Snapshot {
  subjects: Subject[];
  topics: Topic[];
  exams: Exam[];
  assignments: Assignment[];
  sessions: StudySession[];
  availability: Availability;
  moods: MoodCheckIn[];
  changeLog: ChangeLog[];
  /** The student's own recorded achievements. */
  achievements: Achievement[];
  /** True when subjects/topics/exams/hours changed after the plan was last generated. */
  planStale?: boolean;
}

/** One-shot payload from the guided setup wizard (POST /setup). */
export interface SetupPayload {
  subjects: {
    name: string;
    color: string;
    difficulty: Difficulty;
    topics: { name: string; estimatedHours: number; difficulty: Difficulty }[];
  }[];
  /** Exams cover all topics of their subject; assignments are plain deadlines. */
  deadlines: { subjectIndex: number; kind: 'exam' | 'assignment'; title: string; date: ISODateTime }[];
  availability: Availability;
}

/** Subjects, topics and exam dates pulled out of a syllabus or timetable, for the student to review. */
export interface ImportDraft {
  subjects: {
    name: string;
    difficulty: Difficulty;
    topics: { name: string; estimatedHours: number; difficulty: Difficulty; weightage?: number; frequentlyAsked?: boolean }[];
  }[];
  /** Exams point at a subject by index; dates are local 'YYYY-MM-DDTHH:mm'. */
  exams: { subjectIndex: number; title: string; date: ISODateTime }[];
  /** 'ai' = read by Claude, 'rules' = Orbit's built-in parser. */
  source: 'ai' | 'rules';
  notes: string[];
}

/**
 * Standard response for any mutation that can affect the schedule.
 * Returning the full snapshot keeps the client trivially consistent;
 * the backend may later switch to deltas without changing call sites.
 */
export interface MutationResponse {
  snapshot: Snapshot;
  /** Present when the scheduler ran (reflow, generation, mood...). */
  result?: ScheduleResult;
  /** The change-log entry written for this mutation, if any. */
  log?: ChangeLog;
  /** Plain-language explanation lines (mood check-in). */
  explanation?: string[];
}
