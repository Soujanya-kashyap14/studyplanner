import { motion } from 'framer-motion';
import { AlertTriangle, Check, Lock, Play, RefreshCw, SkipForward, X } from 'lucide-react';
import type { StudySession } from '@/types';
import type { Derived } from '@/hooks/useDerived';
import { useDataStore } from '@/store/useDataStore';
import { useUIStore } from '@/store/useUIStore';
import { formatDuration, formatRange } from '@/lib/date';
import { cn, alpha } from '@/lib/utils';

const statusText: Record<StudySession['status'], string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Done',
  missed: 'Skipped',
};

/**
 * One study session in a list: checkbox + topic + time, and labeled
 * Start / Done / Skip actions (Skip moves it to the next free slot).
 */
export function SessionRow({ s, d, compact }: { s: StudySession; d: Derived; compact?: boolean }) {
  const subject = d.subjectById.get(s.subjectId);
  const topic = d.topicById.get(s.topicId);
  const setStatus = useDataStore((st) => st.setSessionStatus);
  const pending = useDataStore((st) => st.pending[`session:${s.id}`]);
  const openFocus = useUIStore((st) => st.openFocus);
  const color = subject?.color ?? '#888';
  const done = s.status === 'completed';
  const missed = s.status === 'missed';
  const active = s.status === 'in_progress';
  const open = s.status === 'planned' || active;

  return (
    <motion.li
      layout
      className={cn(
        'group relative flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border p-4 transition-colors',
        active ? 'border-violet/40 bg-violet/10' : 'border-line/10 bg-line/[0.03] hover:bg-line/[0.05]',
        (done || missed) && 'opacity-70',
      )}
    >
      <span aria-hidden className="h-10 w-1 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${alpha(color, 0.6)}` }} />

      <motion.button
        whileTap={{ scale: 0.8 }}
        disabled={pending || missed}
        onClick={() => void setStatus(s.id, done ? 'planned' : 'completed')}
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark ${topic?.name} as not done` : `Mark ${topic?.name} as done`}
        title={done ? 'Undo done' : 'Mark done'}
        className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition-colors', done ? 'border-mint bg-mint text-on-accent' : 'border-line/25 hover:border-mint', missed && 'border-rose/40')}
      >
        {done && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 18 }}>
            <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
          </motion.span>
        )}
        {missed && <X className="h-3.5 w-3.5 text-rose" aria-hidden />}
      </motion.button>

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium text-ink', done && 'line-through decoration-mint/60')}>{topic?.name ?? 'Unknown topic'}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span>{formatRange(s.start, s.durationMin)}</span>
          {!compact && <span>· {subject?.name}</span>}
          <span>· {formatDuration(s.durationMin)}</span>
          {s.kind === 'revision' && (
            <span className="inline-flex items-center gap-0.5 text-cyan" title="Spaced repetition: a short review so this finished topic sticks">
              <RefreshCw className="h-3 w-3" aria-hidden /> revision · day {s.revisionStep}
            </span>
          )}
          {s.locked && s.status === 'planned' && (
            <span className="inline-flex items-center gap-0.5 text-faint" title="You placed this session yourself, so Orbit won't move it">
              <Lock className="h-3 w-3" aria-hidden /> pinned
            </span>
          )}
          {s.atRisk && (
            <span className="inline-flex items-center gap-0.5 text-amber" title="This session lands after its deadline">
              <AlertTriangle className="h-3 w-3" aria-hidden /> after deadline
            </span>
          )}
          {!open && <span className={done ? 'text-mint' : 'text-rose'}>· {statusText[s.status]}</span>}
        </p>
      </div>

      {open && (
        <div className="flex w-full shrink-0 items-center gap-1.5 sm:w-auto">
          <ActionButton onClick={() => openFocus(s.id)} title="Start a focus timer for this session" tone="violet" icon={<Play className="h-3.5 w-3.5" fill="currentColor" />}>
            Start
          </ActionButton>
          <ActionButton disabled={pending} onClick={() => void setStatus(s.id, 'completed')} title="Mark this session as done" tone="mint" icon={<Check className="h-3.5 w-3.5" />}>
            Done
          </ActionButton>
          <ActionButton disabled={pending} onClick={() => void setStatus(s.id, 'missed')} title="Can't do it now — Orbit moves it to the next free slot before its deadline" tone="muted" icon={<SkipForward className="h-3.5 w-3.5" />}>
            Skip
          </ActionButton>
        </div>
      )}
    </motion.li>
  );
}

function ActionButton({ children, icon, onClick, title, tone, disabled }: { children: string; icon: JSX.Element; onClick: () => void; title: string; tone: 'violet' | 'mint' | 'muted'; disabled?: boolean }) {
  const tones = {
    violet: 'text-violet hover:bg-violet/15 border-violet/25',
    mint: 'text-mint hover:bg-mint/15 border-mint/25',
    muted: 'text-muted hover:bg-line/[0.08] hover:text-ink border-line/15',
  };
  return (
    <motion.button whileTap={{ scale: 0.92 }} onClick={onClick} disabled={disabled} title={title} className={cn('inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:opacity-40 sm:flex-none', tones[tone])}>
      {icon}
      {children}
    </motion.button>
  );
}
