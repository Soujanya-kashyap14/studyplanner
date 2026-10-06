import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FlaskConical, X } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { DemoControls } from './DemoControls';

/** Small collapsed "Demo" button (bottom-left) that opens the demo tools. Hidden when demo mode is off. */
export function DemoFab() {
  const demo = useUIStore((s) => s.demoMode);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  if (!demo) return null;
  return (
    <div ref={ref} className="fixed bottom-24 left-4 z-40 lg:bottom-6 lg:left-[calc(var(--sidebar-w)+24px)]">
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="glass-strong mb-3 w-[min(92vw,420px)] rounded-2xl p-4" role="dialog" aria-label="Demo tools">
            <p className="mb-1 text-sm font-semibold text-ink">Demo tools</p>
            <p className="mb-3 text-xs text-muted">Simulate real life to watch the plan re-arrange itself. Also in Settings → Demo tools.</p>
            <DemoControls />
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Close demo tools' : 'Open demo tools'}
        className="flex h-10 items-center gap-2 rounded-full border border-dashed border-amber/50 bg-[rgb(var(--bg-1)/0.9)] px-4 text-xs font-semibold text-amber shadow-lg backdrop-blur hover:bg-amber/10"
      >
        {open ? <X className="h-4 w-4" aria-hidden /> : <FlaskConical className="h-4 w-4" aria-hidden />}
        Demo
      </button>
    </div>
  );
}
