import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, CircleDot, ExternalLink, Play, X } from 'lucide-react';
import type { ID, Subject, Topic } from '@/types';
import type { Derived } from '@/hooks/useDerived';
import { useDataStore } from '@/store/useDataStore';
import { useUIStore } from '@/store/useUIStore';
import { useMedia, useReducedMotion } from '@/hooks/useMotion';
import { hashString, seeded, cn, alpha } from '@/lib/utils';
import { addDays, relativeDay } from '@/lib/date';

type StarState = 'done' | 'progress' | 'idle' | 'overdue' | 'risk';

interface StarNode {
  topic: Topic;
  subject: Subject;
  x: number;
  y: number;
  state: StarState;
}

interface Layout {
  W: number;
  H: number;
  stars: StarNode[];
  labels: { subject: Subject; x: number; y: number; lit: number; total: number }[];
  links: { a: StarNode; b: StarNode }[];
  dust: [number, number, number][];
}

/** Deterministic constellation layout: each subject is a random-walk cluster in its own region. */
function buildLayout(d: Derived, wide: boolean): Layout {
  const W = wide ? 1000 : 600;
  const H = wide ? 520 : 760;
  const subjects = d.snapshot.subjects;
  const n = Math.max(1, subjects.length);
  const stars: StarNode[] = [];
  const labels: Layout['labels'] = [];
  const links: Layout['links'] = [];

  subjects.forEach((subject, i) => {
    const topics = d.topicsBySubject.get(subject.id) ?? [];
    const rand = seeded(hashString(subject.id));
    // Region for this cluster.
    const pad = 46;
    const rw = wide ? (W - pad * 2) / n : W - pad * 2;
    const rh = wide ? H - pad * 2 - 30 : (H - pad * 2) / n;
    const rx = wide ? pad + rw * i : pad;
    const ry = wide ? pad + 24 : pad + rh * i;
    const cx = rx + rw / 2;
    const cy = ry + rh / 2;

    const pts: [number, number][] = [];
    let angle = rand() * Math.PI * 2;
    let x = cx + (rand() - 0.5) * rw * 0.3;
    let y = cy + (rand() - 0.5) * rh * 0.3;
    const step = Math.min(rw, rh) / Math.max(2.6, Math.sqrt(topics.length) * 1.5);
    for (let k = 0; k < topics.length; k++) {
      let best: [number, number] = [x, y];
      for (let attempt = 0; attempt < 24; attempt++) {
        const a = angle + (rand() - 0.5) * 2.2;
        const s = step * (0.75 + rand() * 0.5);
        const nx = Math.min(rx + rw - 16, Math.max(rx + 16, x + Math.cos(a) * s));
        const ny = Math.min(ry + rh - 16, Math.max(ry + 16, y + Math.sin(a) * s));
        const ok = pts.every(([px, py]) => Math.hypot(px - nx, py - ny) > step * 0.62);
        best = [nx, ny];
        if (ok) {
          angle = a;
          break;
        }
      }
      if (k === 0) best = [x, y];
      pts.push(best);
      [x, y] = best;
    }

    const nodes = topics.map((topic, k): StarNode => {
      const overdue = d.overdueTopicIds.has(topic.id);
      const risk = d.atRiskTopicIds.has(topic.id);
      const state: StarState =
        topic.status === 'completed' ? 'done' : overdue ? 'overdue' : risk ? 'risk' : topic.status === 'in_progress' ? 'progress' : 'idle';
      return { topic, subject, x: pts[k][0], y: pts[k][1], state };
    });
    stars.push(...nodes);
    for (let k = 1; k < nodes.length; k++) links.push({ a: nodes[k - 1], b: nodes[k] });

    const top = Math.min(...nodes.map((s) => s.y), cy);
    labels.push({
      subject,
      x: nodes.length ? nodes.reduce((acc, s) => acc + s.x, 0) / nodes.length : cx,
      y: Math.max(18, top - 26),
      lit: topics.filter((t) => t.status === 'completed').length,
      total: topics.length,
    });
  });

  const r = seeded(99);
  const dust = Array.from({ length: wide ? 120 : 90 }, () => [r() * W, r() * H, r() * 1.1 + 0.25] as [number, number, number]);
  return { W, H, stars, labels, links, dust };
}

const STATE_LABEL: Record<StarState, string> = {
  done: 'Completed',
  progress: 'In progress',
  idle: 'Not started',
  overdue: 'Overdue',
  risk: 'Deadline at risk',
};

/**
 * Constellation View — the home hero.
 * Subjects are clusters, topics are stars. Completed stars glow and link to
 * their neighbours; pending are dim; overdue pulse amber. The more you finish,
 * the more of the sky is lit.
 */
export function ConstellationMap({ d, className }: { d: Derived; className?: string }) {
  const wide = useMedia('(min-width: 768px)');
  const reduce = useReducedMotion();
  const layout = useMemo(() => buildLayout(d, wide), [d, wide]);
  const [hover, setHover] = useState<ID | null>(null);
  const [pinned, setPinned] = useState<ID | null>(null);
  const igniting = useIgnition(d.snapshot.topics);
  const setTopicStatus = useDataStore((s) => s.setTopicStatus);
  const openFocus = useUIStore((s) => s.openFocus);
  const navigate = useNavigate();
  const { W, H } = layout;

  const activeId = pinned ?? hover;
  const active = layout.stars.find((s) => s.topic.id === activeId);
  const lit = d.overallProgress;

  const onKey = (e: KeyboardEvent, id: ID) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setPinned((p) => (p === id ? null : id));
    }
    if (e.key === 'Escape') setPinned(null);
  };

  const nextSessionFor = (topicId: ID) => d.upcomingSessions.find((s) => s.topicId === topicId);

  return (
    <div className={cn('sky-panel relative overflow-hidden rounded-3xl', className)} onMouseLeave={() => setHover(null)}>
      {/* The sky brightens with overall progress */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-1000"
        style={{
          opacity: 0.15 + lit * 0.75,
          background: 'radial-gradient(70% 60% at 50% 45%, rgb(var(--aurora-a) / 0.35), transparent 70%), radial-gradient(50% 40% at 80% 80%, rgb(var(--aurora-b) / 0.3), transparent 70%)',
        }}
      />
      <svg viewBox={`0 0 ${W} ${H}`} className="relative block h-auto w-full" role="group" aria-label={`Constellation map: ${Math.round(lit * 100)}% of your sky is lit`}>
        <defs>
          <radialGradient id="star-halo">
            <stop offset="0%" stopColor="white" stopOpacity="0.9" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Dust */}
        {layout.dust.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="rgb(var(--star))" opacity={0.15 + (i % 7) * 0.06} className={!reduce && i % 3 === 0 ? 'animate-twinkle' : undefined} style={{ animationDelay: `${(i % 9) * 0.4}s` }} />
        ))}

        {/* Links between neighbouring topics */}
        {layout.links.map(({ a, b }) => {
          const both = a.state === 'done' && b.state === 'done';
          const one = a.state === 'done' || b.state === 'done';
          const gid = `lg-${a.topic.id}-${b.topic.id}`;
          return (
            <g key={gid}>
              {one && !both && (
                <defs>
                  <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
                    <stop offset="0%" stopColor={a.subject.color} stopOpacity={a.state === 'done' ? 0.9 : 0.05} />
                    <stop offset="100%" stopColor={b.subject.color} stopOpacity={b.state === 'done' ? 0.9 : 0.05} />
                  </linearGradient>
                </defs>
              )}
              <motion.line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={both ? a.subject.color : one ? `url(#${gid})` : 'rgb(var(--star) / 0.22)'}
                strokeWidth={both ? 2 : 1.3}
                strokeDasharray={one ? undefined : '3 6'}
                filter={both ? 'url(#glow)' : undefined}
                initial={false}
                animate={{ pathLength: 1, opacity: 1 }}
              />
            </g>
          );
        })}

        {/* Subject labels */}
        {layout.labels.map((l) => (
          <g key={l.subject.id} aria-hidden>
            <text x={l.x} y={l.y} textAnchor="middle" className="font-display" fontSize={wide ? 15 : 18} fontWeight={600} fill="rgb(var(--star))" opacity={0.92}>
              {l.subject.name}
            </text>
            <text x={l.x} y={l.y + (wide ? 16 : 20)} textAnchor="middle" className="font-mono" fontSize={wide ? 10 : 12} fill={l.subject.color} letterSpacing="1.5">
              {l.lit}/{l.total} LIT
            </text>
          </g>
        ))}

        {/* Stars */}
        {layout.stars.map((s) => {
          const c = s.subject.color;
          const amber = 'rgb(var(--amber))';
          const r = s.state === 'done' ? 7 : s.state === 'progress' ? 5.5 : 4;
          const isActive = activeId === s.topic.id;
          const progress = s.topic.estimatedHours ? Math.min(1, s.topic.completedHours / s.topic.estimatedHours) : 0;
          const ring = 12;
          const circ = 2 * Math.PI * ring;
          return (
            <g
              key={s.topic.id}
              role="button"
              tabIndex={0}
              aria-label={`${s.topic.name}, ${s.subject.name}. ${STATE_LABEL[s.state]}. Difficulty ${s.topic.difficulty} of 5.`}
              aria-expanded={pinned === s.topic.id}
              className="cursor-pointer outline-none [&:focus-visible>.focus-ring]:opacity-100"
              onMouseEnter={() => setHover(s.topic.id)}
              onFocus={() => setHover(s.topic.id)}
              onBlur={() => setHover(null)}
              onClick={() => setPinned((p) => (p === s.topic.id ? null : s.topic.id))}
              onKeyDown={(e) => onKey(e, s.topic.id)}
            >
              {/* generous invisible hit area */}
              <circle cx={s.x} cy={s.y} r={22} fill="transparent" />
              <circle className="focus-ring opacity-0 transition-opacity" cx={s.x} cy={s.y} r={17} fill="none" stroke="rgb(var(--cyan))" strokeWidth={2} />
              {s.state === 'done' && <circle cx={s.x} cy={s.y} r={22} fill={alpha(c, 0.22)} />}
              {(s.state === 'overdue' || s.state === 'risk') && (
                <motion.circle
                  cx={s.x}
                  cy={s.y}
                  r={10}
                  fill="none"
                  stroke={amber}
                  strokeWidth={1.6}
                  style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                  animate={reduce ? undefined : { scale: [0.8, 1.8], opacity: [0.9, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                />
              )}
              {s.state === 'progress' && (
                <circle
                  cx={s.x}
                  cy={s.y}
                  r={ring}
                  fill="none"
                  stroke={c}
                  strokeOpacity={0.85}
                  strokeWidth={1.6}
                  strokeDasharray={`${circ * progress} ${circ}`}
                  transform={`rotate(-90 ${s.x} ${s.y})`}
                />
              )}
              <motion.circle
                cx={s.x}
                cy={s.y}
                r={r}
                fill={s.state === 'done' ? '#fff' : s.state === 'overdue' || s.state === 'risk' ? amber : s.state === 'progress' ? c : 'rgb(var(--star) / 0.45)'}
                stroke={s.state === 'done' ? c : 'none'}
                strokeWidth={2.5}
                filter={s.state === 'done' || s.state === 'progress' ? 'url(#glow)' : undefined}
                initial={false}
                animate={{ r: isActive ? r + 2.5 : r }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              />
              {/* Ignition burst when a topic is completed */}
              <AnimatePresence>
                {igniting.has(s.topic.id) && (
                  <motion.g initial={{ opacity: 1 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 1.4, delay: 0.3 }}>
                    <motion.circle cx={s.x} cy={s.y} r={6} fill="none" stroke={c} strokeWidth={3} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} initial={{ scale: 1 }} animate={{ scale: 7.5 }} transition={{ duration: 1 }} />
                    {Array.from({ length: 8 }, (_, k) => {
                      const a = (k / 8) * Math.PI * 2;
                      return (
                        <motion.line
                          key={k}
                          x1={s.x}
                          y1={s.y}
                          stroke="#fff"
                          strokeWidth={2}
                          strokeLinecap="round"
                          initial={{ x2: s.x, y2: s.y }}
                          animate={{ x2: s.x + Math.cos(a) * 30, y2: s.y + Math.sin(a) * 30 }}
                          transition={{ duration: 0.6 }}
                        />
                      );
                    })}
                  </motion.g>
                )}
              </AnimatePresence>
            </g>
          );
        })}
      </svg>

      {/* Sky-lit meter */}
      <div className="pointer-events-none absolute bottom-3 left-4 flex items-center gap-3 text-white sm:bottom-4 sm:left-5">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/15 sm:w-36">
          <motion.div className="h-full rounded-full bg-white" initial={{ width: 0 }} animate={{ width: `${lit * 100}%` }} transition={{ duration: 1.2 }} style={{ boxShadow: '0 0 12px white' }} />
        </div>
        <span className="font-mono text-[11px] tracking-widest text-white/85">SKY {Math.round(lit * 100)}% LIT</span>
      </div>
      <div className="pointer-events-none absolute bottom-3 right-4 hidden items-center gap-3 font-mono text-[10px] tracking-wider text-white/75 sm:bottom-4 sm:right-5 sm:flex">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white shadow-[0_0_8px_white]" />DONE</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white/40" />PENDING</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber" />AT RISK</span>
      </div>

      {/* Hover / pinned card */}
      <AnimatePresence>
        {active && (
          <motion.div
            key={active.topic.id}
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className={cn('glass-strong absolute z-10 w-64 p-4 text-left', pinned ? 'pointer-events-auto' : 'pointer-events-none')}
            style={{
              left: `clamp(8px, calc(${(active.x / W) * 100}% - 128px), calc(100% - 264px))`,
              ...(active.y / H > 0.5 ? { bottom: `calc(${(1 - active.y / H) * 100}% + 24px)` } : { top: `calc(${(active.y / H) * 100}% + 24px)` }),
            }}
            role={pinned ? 'dialog' : 'tooltip'}
            aria-label={`${active.topic.name} details`}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="eyebrow flex items-center gap-1.5" style={{ color: active.subject.color }}>
                  {active.subject.name}
                </p>
                <p className="truncate font-display text-[15px] font-semibold text-ink">{active.topic.name}</p>
              </div>
              {pinned && (
                <button onClick={() => setPinned(null)} aria-label="Close" className="rounded-lg p-1 text-faint hover:text-ink">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
              <dt className="text-muted">Status</dt>
              <dd className={cn('text-right font-medium', active.state === 'overdue' || active.state === 'risk' ? 'text-amber' : 'text-ink')}>{STATE_LABEL[active.state]}</dd>
              <dt className="text-muted">Difficulty</dt>
              <dd className="text-right font-mono text-amber" aria-label={`${active.topic.difficulty} of 5`}>
                {'★'.repeat(active.topic.difficulty)}
                <span className="text-faint">{'★'.repeat(5 - active.topic.difficulty)}</span>
              </dd>
              <dt className="text-muted">Hours</dt>
              <dd className="text-right font-mono text-ink">
                {active.topic.completedHours}/{active.topic.estimatedHours}h
              </dd>
              <dt className="text-muted">Deadline</dt>
              <dd className="text-right text-ink">{d.deadlineOf.get(active.topic.id) ? relativeDay(addDays(d.deadlineOf.get(active.topic.id)!, 1)) : '—'}</dd>
            </dl>
            {pinned ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {active.topic.status !== 'completed' && (
                  <>
                    {nextSessionFor(active.topic.id) && (
                      <button
                        onClick={() => {
                          openFocus(nextSessionFor(active.topic.id)!.id);
                          setPinned(null);
                        }}
                        className="flex items-center gap-1 rounded-lg bg-violet/15 px-2 py-1 text-xs font-medium text-violet hover:bg-violet/25"
                      >
                        <Play className="h-3 w-3" /> Focus
                      </button>
                    )}
                    {active.topic.status === 'not_started' && (
                      <button onClick={() => void setTopicStatus(active.topic.id, 'in_progress')} className="flex items-center gap-1 rounded-lg bg-cyan/15 px-2 py-1 text-xs font-medium text-cyan hover:bg-cyan/25">
                        <CircleDot className="h-3 w-3" /> Start
                      </button>
                    )}
                    <button
                      onClick={() => {
                        void setTopicStatus(active.topic.id, 'completed');
                        setPinned(null);
                      }}
                      className="flex items-center gap-1 rounded-lg bg-mint/15 px-2 py-1 text-xs font-medium text-mint hover:bg-mint/25"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Mark done
                    </button>
                  </>
                )}
                <button onClick={() => navigate(`/subjects?subject=${active.subject.id}&topic=${active.topic.id}`)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-line/[0.07] hover:text-ink">
                  <ExternalLink className="h-3 w-3" /> Open
                </button>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-faint">Click the star for actions</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Tracks topics that just flipped to completed, for the ignition burst. */
function useIgnition(topics: Topic[]) {
  const prev = useRef(new Map(topics.map((t) => [t.id, t.status])));
  const [igniting, setIgniting] = useState<Set<ID>>(new Set());
  useEffect(() => {
    const fresh = topics.filter((t) => t.status === 'completed' && prev.current.get(t.id) && prev.current.get(t.id) !== 'completed').map((t) => t.id);
    prev.current = new Map(topics.map((t) => [t.id, t.status]));
    if (!fresh.length) return;
    setIgniting((s) => new Set([...s, ...fresh]));
    const id = window.setTimeout(() => setIgniting((s) => new Set([...s].filter((x) => !fresh.includes(x)))), 1800);
    return () => window.clearTimeout(id);
  }, [topics]);
  return igniting;
}
