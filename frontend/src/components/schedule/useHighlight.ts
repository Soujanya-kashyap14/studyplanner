import { useEffect, useState } from 'react';
import { useDataStore } from '@/store/useDataStore';

/** Ids touched by the most recent reflow, kept "hot" for a few seconds so the calendar can glow them. */
export function useRecentHighlight(ms = 6000) {
  const highlight = useDataStore((s) => s.highlight);
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!highlight.ids.length || Date.now() - highlight.at > ms) return;
    setIds(new Set(highlight.ids));
    const t = window.setTimeout(() => setIds(new Set()), ms - (Date.now() - highlight.at));
    return () => window.clearTimeout(t);
  }, [highlight, ms]);
  return ids;
}
