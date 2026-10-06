/** Per-user flag: the user chose "Skip setup", so don't redirect them to /setup again. */
const key = (userId: string) => `orbit.setupSkipped.${userId}`;

export function isSetupSkipped(userId: string | undefined): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(key(userId)) === '1';
  } catch {
    return false;
  }
}

export function setSetupSkipped(userId: string | undefined, skipped: boolean) {
  if (!userId) return;
  try {
    if (skipped) localStorage.setItem(key(userId), '1');
    else localStorage.removeItem(key(userId));
  } catch {
    /* storage unavailable — the redirect simply happens again */
  }
}
