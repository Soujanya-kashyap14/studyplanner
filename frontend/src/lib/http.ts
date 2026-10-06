import { BASE_URL, TOKEN_KEY } from '@/config/api';
import { getClockOffset } from './clock';

/**
 * Thin fetch wrapper used by services when USE_MOCK === false.
 * Attaches the JWT, parses JSON, and throws ApiError on non-2xx.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // The server plans in the student's local time (and honours Demo Mode time travel).
        'X-Orbit-TZ-Offset': String(new Date().getTimezoneOffset()),
        'X-Orbit-Clock-Offset': String(getClockOffset()),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, "Can't reach the Orbit server. Check that the backend is running and try again.");
  }
  // Expired or invalid session → back to login.
  if (res.status === 401 && !path.startsWith('/auth/')) {
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new CustomEvent('orbit:unauthorized'));
  }
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

/** Resolve after `ms` — used by the mock layer to simulate latency. */
export const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
