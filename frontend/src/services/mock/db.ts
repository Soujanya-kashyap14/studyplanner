/**
 * MOCK DATABASE — stands in for the backend while USE_MOCK is true.
 * Persists to localStorage under a single key. Delete this folder once the
 * real API is live; nothing outside /services imports it.
 */
import type { ChangeLog, ID, ScheduleResult, Snapshot, User } from '@/types';
import type { SchedulerInput } from '@/utils/scheduler';
import { createSeed } from '@/data/seed';
import { nowMinutes, todayISO } from '@/lib/date';
import { TOKEN_KEY } from '@/config/api';
import { now } from '@/lib/clock';
import { uid } from '@/lib/utils';
import { DEFAULT_AVAILABILITY } from '@/data/defaults';

export function emptySnapshot(): Snapshot {
  return {
    subjects: [],
    topics: [],
    exams: [],
    assignments: [],
    sessions: [],
    availability: structuredClone(DEFAULT_AVAILABILITY),
    moods: [],
    changeLog: [],
    achievements: [],
  };
}

const DB_KEY = 'orbit.db.v1';

interface StoredUser {
  user: User;
  /** NOT secure — mock only. A real backend hashes with bcrypt/argon2. */
  passwordHash: string;
}

interface DB {
  users: StoredUser[];
  data: Record<ID, Snapshot>;
}

export const DEMO_EMAIL = 'demo@orbit.app';
export const DEMO_PASSWORD = 'orbit123';

export const mockHash = (pw: string) => btoa(unescape(encodeURIComponent(`orbit:${pw}`)));

function read(): DB {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch {
    /* corrupted storage — start fresh */
  }
  const demo: User = {
    id: 'usr_demo',
    name: 'Maya Chen',
    email: DEMO_EMAIL,
    preferredSessionMinutes: 50,
    breakMinutes: 10,
    createdAt: new Date().toISOString(),
  };
  return { users: [{ user: demo, passwordHash: mockHash(DEMO_PASSWORD) }], data: {} };
}

function write(db: DB) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export const db = {
  users(): StoredUser[] {
    return read().users;
  },
  findUserByEmail(email: string) {
    return read().users.find((u) => u.user.email.toLowerCase() === email.toLowerCase());
  },
  addUser(entry: StoredUser) {
    const d = read();
    d.users.push(entry);
    write(d);
  },
  updateUser(id: ID, patch: Partial<User>): User {
    const d = read();
    const entry = d.users.find((u) => u.user.id === id);
    if (!entry) throw new Error('User not found');
    entry.user = { ...entry.user, ...patch };
    write(d);
    return entry.user;
  },
  getUser(id: ID): User | undefined {
    return read().users.find((u) => u.user.id === id)?.user;
  },

  /** The current user's whole dataset (seeded on first access). */
  snapshot(userId: ID): Snapshot {
    const d = read();
    if (!d.data[userId]) {
      const u = d.users.find((x) => x.user.id === userId)?.user;
      // The demo account explores a rich sample universe; real accounts start empty and go through setup.
      d.data[userId] = u?.email === DEMO_EMAIL ? createSeed(u.preferredSessionMinutes, u.breakMinutes) : emptySnapshot();
      write(d);
    }
    const snap = structuredClone(d.data[userId]) as Snapshot & { unlockedAchievements?: unknown };
    snap.achievements ??= []; // data saved by older versions
    delete snap.unlockedAchievements;
    return snap;
  },

  /** Read-modify-write the current user's dataset. */
  mutate(userId: ID, fn: (s: Snapshot) => void): Snapshot {
    const snap = db.snapshot(userId);
    fn(snap);
    const d = read();
    d.data[userId] = snap;
    write(d);
    return structuredClone(snap);
  },

  /** Wipe the user's data (Settings → Start fresh). */
  clear(userId: ID): Snapshot {
    const d = read();
    d.data[userId] = emptySnapshot();
    write(d);
    return structuredClone(d.data[userId]);
  },

  /** Load the sample universe (Settings / setup → explore with sample data). */
  reset(userId: ID): Snapshot {
    const d = read();
    const u = d.users.find((x) => x.user.id === userId)?.user;
    d.data[userId] = createSeed(u?.preferredSessionMinutes, u?.breakMinutes);
    write(d);
    return structuredClone(d.data[userId]);
  },
};

/** Decode the mock JWT to find who is calling (the backend does this from the Authorization header). */
export function currentUserId(): ID {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error('Not authenticated');
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.sub as ID;
  } catch {
    throw new Error('Invalid session token');
  }
}

/** Build the scheduler input from a snapshot (the backend would do the same server-side). */
export function schedulerInput(snap: Snapshot, userId: ID): SchedulerInput {
  const user = db.getUser(userId);
  const today = todayISO();
  return {
    subjects: snap.subjects,
    topics: snap.topics,
    exams: snap.exams,
    assignments: snap.assignments,
    sessions: snap.sessions,
    availability: snap.availability,
    today,
    nowMin: nowMinutes(),
    sessionMinutes: user?.preferredSessionMinutes ?? 50,
    breakMinutes: user?.breakMinutes ?? 10,
    mood: snap.moods.find((m) => m.date === today)?.mood,
  };
}

/** Apply a scheduler result to the snapshot and record it in the change log. */
export function commitResult(snap: Snapshot, result: ScheduleResult, trigger: string): ChangeLog | undefined {
  snap.sessions = result.sessions;
  if (!result.changes.length && !result.warnings.length && !trigger.startsWith('Plan generated')) return undefined;
  const log: ChangeLog = {
    id: uid('log'),
    createdAt: now().toISOString(),
    trigger,
    summary: result.summary,
    changes: result.changes,
    warnings: result.warnings,
  };
  snap.changeLog = [log, ...snap.changeLog].slice(0, 20);
  return log;
}
