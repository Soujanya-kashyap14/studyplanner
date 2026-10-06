import { useEffect, useState } from 'react';
import { useReducedMotion as useFramerReducedMotion } from 'framer-motion';
import { useUIStore } from '@/store/useUIStore';

/** True if the OS asks for reduced motion OR the user toggled it in Settings. */
export function useReducedMotion(): boolean {
  const os = useFramerReducedMotion();
  const pref = useUIStore((s) => s.reducedMotion);
  return Boolean(os) || pref;
}

/** Shared motion presets (all under 400ms, per the motion spec). */
export const ease = [0.22, 1, 0.36, 1] as const;

export const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18 } },
};

export const stagger = (step = 0.05) => ({
  animate: { transition: { staggerChildren: step } },
});

export const listItem = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease } },
};

/** Re-render on an interval (for countdowns and "now" lines). */
export function useTick(ms = 1000) {
  const [, setT] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setT((t) => t + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

/** Media query hook (e.g. '(min-width: 1024px)'). */
export function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}
