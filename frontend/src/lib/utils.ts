import clsx, { type ClassValue } from 'clsx';

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export const uid = (prefix = 'id') =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

export const round1 = (n: number) => Math.round(n * 10) / 10;

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function groupBy<T, K extends string | number>(xs: T[], key: (x: T) => K): Record<K, T[]> {
  return xs.reduce(
    (acc, x) => {
      (acc[key(x)] ||= []).push(x);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

/** Hex color -> rgba() string with given alpha. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Deterministic pseudo-random generator (mulberry32) for stable star layouts. */
export function seeded(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const plural = (n: number, word: string, pluralWord = `${word}s`) =>
  `${n} ${n === 1 ? word : pluralWord}`;

/** Signature colors offered when creating a subject. Amber is reserved for urgency. */
export const SUBJECT_COLORS = [
  '#8B7CFF', // violet
  '#38D9F5', // cyan
  '#F472B6', // pink
  '#4ADE80', // green
  '#60A5FA', // sky
  '#FB7185', // coral
  '#A3E635', // lime
  '#C084FC', // orchid
];

/**
 * Chart-mark variant of a subject's signature color, validated with the
 * dataviz palette checker: luminous UI colors are too light for chart marks,
 * so they are darkened per theme (Midnight 28%, Dawn 18%) to land inside the
 * lightness band while keeping chroma and CVD separation.
 */
export function chartColor(hex: string, theme: 'midnight' | 'dawn'): string {
  const a = theme === 'midnight' ? 0.28 : 0.18;
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - a)).toString(16).padStart(2, '0'));
  return `#${ch.join('')}`;
}
