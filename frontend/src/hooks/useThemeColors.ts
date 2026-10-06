import { useMemo } from 'react';
import { useUIStore } from '@/store/useUIStore';

const read = (name: string) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().split(/\s+/).join(', ')})`;

/** Resolved theme colors for libraries (Recharts) that need concrete color strings. */
export function useThemeColors() {
  const theme = useUIStore((s) => s.theme);
  return useMemo(
    () => ({
      theme,
      ink: read('ink'),
      muted: read('ink-muted'),
      faint: read('ink-faint'),
      grid: theme === 'midnight' ? 'rgba(255,255,255,0.07)' : 'rgba(28,26,54,0.08)',
      surface: read('bg-1'),
      violet: read('violet'),
      cyan: read('cyan'),
      amber: read('amber'),
      rose: read('rose'),
      mint: read('mint'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme],
  );
}
