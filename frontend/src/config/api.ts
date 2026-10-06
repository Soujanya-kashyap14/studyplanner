/**
 * API configuration.
 *
 * USE_MOCK = true  -> every service resolves against the in-browser mock DB
 *                     (src/services/mock/db.ts, persisted to localStorage).
 * USE_MOCK = false -> services call the real backend at BASE_URL using `http()`.
 *
 * Toggle with VITE_USE_MOCK / VITE_API_BASE_URL in .env.local.
 */
export const USE_MOCK: boolean = (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false';

// Same-origin '/api' works both in dev (Vite proxies it to the backend) and in production (the backend serves the app).
export const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api';

/** Simulated network latency for the mock layer (ms). Keeps skeletons honest. */
export const MOCK_LATENCY = { read: 450, write: 160 };

export const TOKEN_KEY = 'orbit.token';
