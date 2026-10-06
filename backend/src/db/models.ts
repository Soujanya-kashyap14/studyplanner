import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * Orbit's MongoDB collections.
 * Every document belongs to one user (`userId`) and keeps the client-facing
 * string id in `id` (unique per user), so API payloads match the frontend types.
 */

const opts = { versionKey: false as const, minimize: false };
const owned = { userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, id: { type: String, required: true } };

/* ---------------- users ---------------- */

const dailyAvailability = new Schema({ weekday: { type: Number, min: 0, max: 6, required: true }, hours: { type: Number, min: 0, max: 24, required: true }, startTime: { type: String, required: true } }, { _id: false });
const availabilityOverride = new Schema({ date: { type: String, required: true }, hours: { type: Number, min: 0, max: 24, required: true }, startTime: { type: String, required: true }, note: String, source: String }, { _id: false });

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    preferredSessionMinutes: { type: Number, default: 50 },
    breakMinutes: { type: Number, default: 10 },
    availability: {
      weekly: { type: [dailyAvailability], default: [] },
      overrides: { type: [availabilityOverride], default: [] },
      bufferBeforeExams: Boolean,
      burnoutGuard: Boolean,
    },
    planStale: { type: Boolean, default: false },
  },
  { ...opts, timestamps: true },
);
export type UserDoc = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId };
export const User = mongoose.model('User', userSchema);

/* ---------------- study data ---------------- */

const subjectSchema = new Schema({ ...owned, name: { type: String, required: true }, color: String, difficulty: { type: Number, min: 1, max: 5 }, createdAt: String }, opts);

const topicSchema = new Schema(
  {
    ...owned,
    subjectId: { type: String, required: true },
    name: { type: String, required: true },
    difficulty: { type: Number, min: 1, max: 5 },
    estimatedHours: Number,
    completedHours: { type: Number, default: 0 },
    status: { type: String, enum: ['not_started', 'in_progress', 'completed'], default: 'not_started' },
    deadline: String,
    order: Number,
    completedAt: String,
    weightage: Number,
    frequentlyAsked: Boolean,
  },
  opts,
);

const examSchema = new Schema({ ...owned, subjectId: { type: String, required: true }, title: { type: String, required: true }, date: { type: String, required: true }, topicIds: { type: [String], default: [] }, location: String }, opts);

const assignmentSchema = new Schema(
  { ...owned, subjectId: { type: String, required: true }, title: { type: String, required: true }, dueDate: { type: String, required: true }, status: { type: String, enum: ['todo', 'in_progress', 'done'], default: 'todo' }, topicId: String },
  opts,
);

const sessionSchema = new Schema(
  {
    ...owned,
    topicId: { type: String, required: true },
    subjectId: { type: String, required: true },
    date: { type: String, required: true, index: true },
    start: { type: String, required: true },
    durationMin: { type: Number, required: true },
    status: { type: String, enum: ['planned', 'in_progress', 'completed', 'missed'], required: true },
    actualMin: Number,
    source: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    locked: Boolean,
    atRisk: Boolean,
    rescheduledTo: String,
    completedAt: String,
    kind: { type: String, enum: ['study', 'revision'] },
    revisionStep: Number,
  },
  opts,
);

const moodSchema = new Schema(
  { userId: owned.userId, date: { type: String, required: true }, mood: { type: String, enum: ['energized', 'okay', 'drained'], required: true }, createdAt: String },
  opts,
);

const changeLogSchema = new Schema({ ...owned, createdAt: String, trigger: String, summary: String, changes: { type: Schema.Types.Mixed, default: [] }, warnings: { type: Schema.Types.Mixed, default: [] } }, opts);

const achievementSchema = new Schema(
  {
    ...owned,
    title: { type: String, required: true },
    category: { type: String, enum: ['grades', 'exam', 'subjects', 'award', 'project', 'other'], required: true },
    date: { type: String, required: true },
    subjectId: String,
    result: String,
    note: String,
    createdAt: String,
  },
  opts,
);

for (const s of [subjectSchema, topicSchema, examSchema, assignmentSchema, sessionSchema, changeLogSchema, achievementSchema]) s.index({ userId: 1, id: 1 }, { unique: true });
moodSchema.index({ userId: 1, date: 1 }, { unique: true });

export const Subject = mongoose.model('Subject', subjectSchema);
export const Topic = mongoose.model('Topic', topicSchema);
export const Exam = mongoose.model('Exam', examSchema);
export const Assignment = mongoose.model('Assignment', assignmentSchema);
export const Session = mongoose.model('Session', sessionSchema, 'sessions');
export const Mood = mongoose.model('Mood', moodSchema);
export const ChangeLog = mongoose.model('ChangeLog', changeLogSchema, 'changelogs');
export const Achievement = mongoose.model('Achievement', achievementSchema);

/** Snapshot array → collection, and the field that identifies a document within a user. */
export const COLLECTIONS: { key: 'subjects' | 'topics' | 'exams' | 'assignments' | 'sessions' | 'moods' | 'changeLog' | 'achievements'; model: Model<any>; idField: string }[] = [
  { key: 'subjects', model: Subject, idField: 'id' },
  { key: 'topics', model: Topic, idField: 'id' },
  { key: 'exams', model: Exam, idField: 'id' },
  { key: 'assignments', model: Assignment, idField: 'id' },
  { key: 'sessions', model: Session, idField: 'id' },
  { key: 'moods', model: Mood, idField: 'date' },
  { key: 'changeLog', model: ChangeLog, idField: 'id' },
  { key: 'achievements', model: Achievement, idField: 'id' },
];
