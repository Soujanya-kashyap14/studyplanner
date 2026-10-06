import { motion } from 'framer-motion';
import { AlertTriangle, Check, CornerDownRight, Lock, Loader, RefreshCw } from 'lucide-react';
import type { StudySession } from '@/types';
import type { Derived } from '@/hooks/useDerived';
import { formatTime, minToTime, timeToMin } from '@/lib/date';
import { alpha, cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useMotion';

/** Spring used for the Living Schedule reflow — deliberately slower and bouncier than UI motion. */
export const REFLOW_SPRING = { type: 'spring', stiffness: 110, damping: 17, mass: 1 } as const;

interface Props {
  s: StudySession;
  d: Derived;
  style?: React.CSSProperties;
  hot?: boolean;
  dimmed?: boolean;
  compact?: boolean;
  /** Opens the session popover, anchored to the clicked block. */
  onOpen: (s: StudySession, anchor: DOMRect) => void;
  onDragStart?: (s: StudySession) => void;
  onDragEnd?: () => void;
}

/**
 * Calendar block for one session. `layoutId` = session id, so when the scheduler
 * moves a session to another slot/day, it physically slides there.
 */
export function SessionBlock({ s, d, style, hot, dimmed, compact, onOpen, onDragStart, onDragEnd }: Props) {
  const reduce = useReducedMotion();
  const subject = d.subjectById.get(s.subjectId);
  const topic = d.topicById.get(s.topicId);
  const color = subject?.color ?? '#888';
  const missed = s.status === 'missed';
  const done = s.status === 'completed';
  const active = s.status === 'in_progress';
  const draggable = s.status === 'planned' && !!onDragStart;
  const end = minToTime(timeToMin(s.start) + s.durationMin);
  const revision = s.kind === 'revision';
  const label = `${revision ? 'Revision: ' : ''}${topic?.name}, ${subject?.name}. ${formatTime(s.start)} to ${formatTime(end)}. ${s.status.replace('_', ' ')}${s.atRisk ? ', after deadline' : ''}${s.locked && s.status === 'planned' ? ', pinned' : ''}`;

  return (
    <motion.div
      layout={!reduce}
      layoutId={reduce ? undefined : s.id}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: dimmed ? 0.35 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
      transition={{ layout: REFLOW_SPRING, default: { duration: 0.25 } }}
      style={style}
      className={cn('absolute inset-x-1 z-[1]', hot && 'z-[3]')}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', s.id);
          e.dataTransfer.effectAllowed = 'move';
          onDragStart?.(s);
        }}
        onDragEnd={onDragEnd}
        onClick={(e) => onOpen(s, e.currentTarget.getBoundingClientRect())}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen(s, e.currentTarget.getBoundingClientRect());
          }
        }}
        className={cn(
          'group relative h-full overflow-hidden rounded-xl border px-2 py-1 text-left transition-[box-shadow,transform] duration-200 hover:-translate-y-px',
          draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
          (missed || revision) && 'border-dashed',
        )}
        style={{
          background: missed ? alpha('#FF7A90', 0.06) : done ? alpha(color, 0.1) : `linear-gradient(160deg, ${alpha(color, 0.32)}, ${alpha(color, 0.14)})`,
          borderColor: missed ? 'rgb(var(--rose) / 0.45)' : s.atRisk ? 'rgb(var(--amber))' : alpha(color, done ? 0.3 : 0.6),
          boxShadow: hot ? `0 0 0 2px rgb(var(--cyan)), 0 0 24px rgb(var(--cyan) / 0.6)` : active ? `0 0 0 2px ${color}` : undefined,
        }}
      >
        {hot && !reduce && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-xl"
            initial={{ opacity: 0.9 }}
            animate={{ opacity: [0.9, 0.2, 0.9] }}
            transition={{ duration: 1.4, repeat: 3 }}
            style={{ background: 'linear-gradient(110deg, transparent 20%, rgb(var(--cyan) / 0.25) 50%, transparent 80%)' }}
          />
        )}
        <div className="relative flex items-start gap-1">
          {revision && <RefreshCw className="mt-px h-3 w-3 shrink-0 text-cyan" aria-hidden />}
          <span className={cn('min-w-0 flex-1 truncate text-[11px] font-semibold leading-tight text-ink', (missed || done) && 'line-through decoration-1 opacity-70')}>{topic?.name}</span>
          {done && <Check className="h-3 w-3 shrink-0 text-mint" aria-hidden />}
          {active && <Loader className="h-3 w-3 shrink-0 animate-spin text-violet [animation-duration:3s]" aria-hidden />}
          {s.locked && s.status === 'planned' && <Lock className="h-3 w-3 shrink-0 text-muted" aria-hidden />}
          {s.atRisk && <AlertTriangle className="h-3 w-3 shrink-0 text-amber" aria-hidden />}
        </div>
        {!compact && (
          <p className="relative truncate font-mono text-[10px] text-muted">
            {missed ? (
              <span className="inline-flex items-center gap-0.5 text-rose">
                missed
                {s.rescheduledTo && (
                  <>
                    <CornerDownRight className="h-2.5 w-2.5" aria-hidden /> moved
                  </>
                )}
              </span>
            ) : (
              `${revision ? `review · day ${s.revisionStep} · ` : ''}${formatTime(s.start)} – ${formatTime(end)}`
            )}
          </p>
        )}
      </div>
    </motion.div>
  );
}
