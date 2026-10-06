import { useEffect } from 'react';

/** Bind a keyboard shortcut. `combo` like 'mod+k' (mod = Ctrl on Windows/Linux, Cmd on macOS) or 'escape'. */
export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const parts = combo.toLowerCase().split('+');
    const key = parts.pop()!;
    const needMod = parts.includes('mod');
    const needShift = parts.includes('shift');
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (needMod !== mod) return;
      if (needShift !== e.shiftKey) return;
      if (e.key.toLowerCase() !== key) return;
      handler(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, handler, enabled]);
}
