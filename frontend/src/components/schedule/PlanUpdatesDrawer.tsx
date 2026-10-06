import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, History, X } from 'lucide-react';
import type { Derived } from '@/hooks/useDerived';
import { describeLog } from '@/utils/planUpdates';
import { SubjectDot } from '@/components/ui/Feedback';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const timeAgo = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).toLowerCase();
};

/**
 * "Plan updates" — every time Orbit re-arranged your plan, in plain language.
 * A side drawer (bottom sheet on phones), opened from the "Plan updates (n)" button.
 * Hovering an entry spotlights that session on the calendar.
 */
export function PlanUpdatesDrawer({ d, open, onClose, onHover }: { d: Derived; open: boolean; onClose: () => void; onHover: (id: string | null) => void }) {
  const updates = useMemo(() => d.snapshot.changeLog.slice(0, 12).map((l) => describeLog(l, d.snapshot)), [d.snapshot]);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-[60] bg-[rgb(var(--bg-0)/0.35)] sm:bg-transparent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden />
          <motion.aside
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-label="Plan updates"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            className="glass-strong fixed bottom-0 right-0 top-[72px] z-[61] flex w-full max-w-md flex-col rounded-none border-l border-line/10 outline-none sm:rounded-l-3xl"
            onMouseLeave={() => onHover(null)}
          >
            <header className="flex items-start justify-between gap-3 border-b border-line/10 p-6">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
                  <History className="h-4 w-4 text-cyan" aria-hidden /> Plan updates
                </h2>
                <p className="mt-1 text-xs text-muted">Every time Orbit re-arranged your plan, and why. Hover an entry to find it on the calendar.</p>
              </div>
              <IconButton label="Close plan updates" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </IconButton>
            </header>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {updates.length === 0 && <EmptyState compact art="comet" title="No updates yet" description="When you skip a session, finish early, move a block or change your hours, Orbit re-plans and explains it here." />}
              {updates.map((u, i) => (
                <section key={u.id} className={cn('rounded-2xl border p-4', i === 0 ? 'border-cyan/30 bg-cyan/[0.05]' : 'border-line/10 bg-line/[0.03]')}>
                  <p className="text-[11px] text-faint">{i === 0 ? 'Latest · ' : ''}{timeAgo(u.createdAt)}</p>
                  <p className="mt-1 text-sm font-semibold text-ink">{u.headline}</p>
                  {u.warnings.map((w) => (
                    <p key={w} className="mt-2 flex gap-2 rounded-xl border border-amber/30 bg-amber/[0.08] p-2.5 text-xs text-ink">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden />
                      {w}
                    </p>
                  ))}
                  {u.groups.map((g) => (
                    <details key={g.id} className="mt-3" open={i === 0 && g.id === 'moved'}>
                      <summary className="cursor-pointer select-none text-xs font-semibold text-muted hover:text-ink">{g.title}</summary>
                      <ul className="mt-2 space-y-1.5">
                        {g.items.map((it) => {
                          const subj = d.subjectById.get(it.subjectId);
                          return (
                            <li
                              key={it.sessionId}
                              tabIndex={0}
                              onMouseEnter={() => onHover(it.sessionId)}
                              onFocus={() => onHover(it.sessionId)}
                              onBlur={() => onHover(null)}
                              className="rounded-xl bg-line/[0.04] px-3 py-2 text-xs outline-none hover:bg-line/[0.08] focus-visible:ring-2 focus-visible:ring-cyan/50"
                            >
                              <p className="flex items-center gap-2 font-medium text-ink">
                                {subj && <SubjectDot color={subj.color} glow={false} />}
                                {it.topic}
                              </p>
                              <p className="mt-0.5 text-muted">{it.text}</p>
                              {it.reason && <p className="mt-0.5 text-faint">{it.reason}</p>}
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  ))}
                </section>
              ))}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
