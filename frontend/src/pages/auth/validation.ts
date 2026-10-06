/** Small, dependency-free validators shared by the auth and settings forms. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(v: string): string | undefined {
  if (!v.trim()) return 'Email is required.';
  if (!EMAIL_RE.test(v.trim())) return 'Enter a valid email, like you@school.edu.';
}

export function validatePassword(v: string): string | undefined {
  if (!v) return 'Password is required.';
  if (v.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'Mix letters and at least one number.';
}

export function validateName(v: string): string | undefined {
  if (!v.trim()) return 'Tell us what to call you.';
  if (v.trim().length < 2) return 'Name is a little short.';
}
