import type { AuthResponse, User } from '@/types';
import { MOCK_LATENCY, TOKEN_KEY, USE_MOCK } from '@/config/api';
import { delay, http, json } from '@/lib/http';
import { currentUserId, db, mockHash } from './mock/db';
import { uid } from '@/lib/utils';

/* ---------- mock JWT helpers (the backend issues real signed JWTs) ---------- */
const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

function mockToken(user: User): string {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 days
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: user.id, email: user.email, exp })}.mock-signature`;
}

/** True if a token exists and has not expired (client-side check only). */
export function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export const authService = {
  /** POST /auth/login */
  async login(email: string, password: string): Promise<AuthResponse> {
    if (!USE_MOCK) {
      const res = await http<AuthResponse>('/auth/login', { method: 'POST', ...json({ email, password }) });
      localStorage.setItem(TOKEN_KEY, res.token);
      return res;
    }
    await delay(MOCK_LATENCY.read);
    const entry = db.findUserByEmail(email);
    if (!entry || entry.passwordHash !== mockHash(password)) throw new Error('That email and password don’t match an account.');
    const token = mockToken(entry.user);
    localStorage.setItem(TOKEN_KEY, token);
    return { token, user: entry.user };
  },

  /** POST /auth/register */
  async register(name: string, email: string, password: string): Promise<AuthResponse> {
    if (!USE_MOCK) {
      const res = await http<AuthResponse>('/auth/register', { method: 'POST', ...json({ name, email, password }) });
      localStorage.setItem(TOKEN_KEY, res.token);
      return res;
    }
    await delay(MOCK_LATENCY.read);
    if (db.findUserByEmail(email)) throw new Error('An account with this email already exists.');
    const user: User = {
      id: uid('usr'),
      name: name.trim(),
      email: email.trim(),
      preferredSessionMinutes: 50,
      breakMinutes: 10,
      createdAt: new Date().toISOString(),
    };
    db.addUser({ user, passwordHash: mockHash(password) });
    const token = mockToken(user);
    localStorage.setItem(TOKEN_KEY, token);
    return { token, user };
  },

  /** POST /auth/logout (stateless JWT: the client just forgets the token) */
  async logout(): Promise<void> {
    if (!USE_MOCK) await http<void>('/auth/logout', { method: 'POST' }).catch(() => undefined);
    localStorage.removeItem(TOKEN_KEY);
  },

  /** GET /me */
  async me(): Promise<User> {
    if (!USE_MOCK) return http<User>('/me');
    await delay(MOCK_LATENCY.write);
    const user = db.getUser(currentUserId());
    if (!user) throw new Error('Session expired');
    return user;
  },

  /** PATCH /me */
  async updateProfile(patch: Partial<Pick<User, 'name' | 'email' | 'preferredSessionMinutes' | 'breakMinutes'>>): Promise<User> {
    if (!USE_MOCK) return http<User>('/me', { method: 'PATCH', ...json(patch) });
    await delay(MOCK_LATENCY.write);
    return db.updateUser(currentUserId(), patch);
  },
};
