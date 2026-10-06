import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Coffee, FastForward, Flag, Pause, Play, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useDataStore } from '@/store/useDataStore';
import { useDerived } from '@/hooks/useDerived';
import { useReducedMotion } from '@/hooks/useMotion';
import { AmbientSound } from './ambient';
import { Button, IconButton } from '@/components/ui/Button';
import { formatDuration, relativeDay, formatTime } from '@/lib/date';
import { cn } from '@/lib/utils';

const WORK = 25 * 60;
const BREAK = 5 * 60;
type Phase = 'focus' | 'break' | 'done';

/**
 * Focus Mode: full-screen, distraction-free Pomodoro for the current session.
 * Breathing-orbit visual, generated ambient sound, and a star-ignition celebration.
 */
export function FocusMode() {
  const open = useUIStore((s) => s.focusOpen);
  return createPortal(<AnimatePresence>{open && <FocusOverlay key="focus" />}</AnimatePresence>, document.body);
}

function FocusOverlay() {
  const d = useDerived();
  const close = useUIStore((s) => s.closeFocus);
  const requestedId = useUIStore((s) => s.focusSessionId);
  const demo = useUIStore((s) => s.demoMode);
  const setStatus = useDataStore((s) => s.setSessionStatus);
  const reduce = useReducedMotion();

  const candidates = useMemo(() => d?.upcomingSessions.slice(0, 8) ?? [], [d]);
  const [sessionId, setSessionId] = useState<string | null>(requestedId ?? d?.nextSession?.id ?? null);
  const session = d?.snapshot.sessions.find((s) => s.id === sessionId) ?? null;
  const topic = session ? d?.topicById.get(session.topicId) : undefined;
  const subject = session ? d?.subjectById.get(session.subjectId) : undefined;
  const color = subject?.color ?? '#A79BFF';
  const target = (session?.durationMin ?? 25) * 60;

  const [running, setRunning] = useState(false);
  const [sound, setSound] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [celebrate, setCelebrate] = useState(false);
  const [, rerender] = useState(0);
  // Timer state lives in a ref: the interval mutates it, then triggers a render.
  const clock = useRef<{ phase: Phase; left: number; focused: number }>({ phase: 'focus', left: Math.min(WORK, target), focused: 0 });
  const audio = useRef(new AmbientSound());
  const started = useRef(false);
  const { phase, left: phaseLeft, focused } = clock.current;

  // Reset when switching session.
  useEffect(() => {
    setRunning(false);
    clock.current = { phase: 'focus', left: Math.min(WORK, target), focused: 0 };
    started.current = false;
    rerender((n) => n + 1);
  }, [sessionId, target]);

  const finish = useCallback(
    async (early: boolean) => {
      setRunning(false);
      clock.current.phase = 'done';
      if (!session) return;
      const minutes = early ? Math.max(5, Math.round(clock.current.focused / 60)) : session.durationMin;
      setCelebrate(true);
      await setStatus(session.id, 'completed', minutes);
    },
    [session, setStatus],
  );

  const skipPhase = () => {
    clock.current.left = 0.01;
    rerender((n) => n + 1);
  };

  // Timer loop (delta-based so it stays accurate when the tab is throttled).
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const t = performance.now();
      const dt = ((t - last) / 1000) * speed;
      last = t;
      const c = clock.current;
      if (c.phase === 'focus') {
        const step = Math.min(dt, c.left);
        c.focused = Math.min(target, c.focused + step);
      }
      c.left -= dt;
      if (c.left <= 0) {
        if (c.phase === 'focus') {
          if (c.focused >= target - 1) {
            c.left = 0;
            void finish(false);
          } else {
            c.phase = 'break';
            c.left = BREAK;
          }
        } else if (c.phase === 'break') {
          c.phase = 'focus';
          c.left = Math.min(WORK, target - c.focused);
        }
      }
      rerender((n) => n + 1);
    }, 200);
    return () => window.clearInterval(id);
  }, [running, speed, target, finish]);

  useEffect(() => {
    const a = audio.current;
    if (sound) a.start();
    else a.stop();
    return () => a.stop();
  }, [sound]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === ' ' && (e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'SELECT') {
        e.preventDefault();
        setRunning((r) => !r);
      }
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [close]);

  const start = () => {
    if (session && !started.current && session.status === 'planned') {
      started.current = true;
      void setStatus(session.id, 'in_progress');
    }
    setRunning(true);
  };

  const progress = target ? focused / target : 0;
  const mm = String(Math.floor(Math.max(0, phaseLeft) / 60)).padStart(2, '0');
  const ss = String(Math.floor(Math.max(0, phaseLeft) % 60)).padStart(2, '0');
  const R = 130;
  const C = 2 * Math.PI * R;
  const breathing = phase === 'break' || !running;

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Focus mode"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="fixed inset-0 z-[85] flex flex-col overflow-y-auto bg-[#070A16] text-white"
    >
      {/* Deep sky backdrop, tinted by the subject color */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(60% 50% at 50% 45%, ${color}33, transparent 70%), radial-gradient(40% 40% at 80% 90%, #38D9F51f, transparent 70%)` }} />

      <header className="relative flex items-center justify-between p-4 sm:p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/60">Focus mode</p>
        <div className="flex items-center gap-1">
          <IconButton label={sound ? 'Turn ambient sound off' : 'Turn ambient sound on'} onClick={() => setSound((s) => !s)} className="text-white/70 hover:bg-white/10 hover:text-white" active={sound}>
            {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </IconButton>
          {demo && (
            <IconButton label={speed === 1 ? 'Demo: speed up time 60×' : 'Back to normal speed'} onClick={() => setSpeed((s) => (s === 1 ? 60 : 1))} className={cn('text-white/70 hover:bg-white/10 hover:text-white', speed > 1 && 'bg-amber/20 text-amber')}>
              <FastForward className="h-5 w-5" />
            </IconButton>
          )}
          <IconButton label="Exit focus mode" onClick={close} className="text-white/70 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </IconButton>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-10">
        <AnimatePresence mode="wait">
          {celebrate ? (
            <Ignition key="ignite" color={color} topicName={topic?.name ?? 'Session'} onClose={close} minutes={Math.round(focused / 60) || session?.durationMin || 0} />
          ) : (
            <motion.div key="timer" className="flex flex-col items-center gap-6" exit={{ opacity: 0, scale: 0.95 }}>
              <div className="text-center">
                <p className="font-mono text-xs uppercase tracking-widest" style={{ color }}>
                  {subject?.name ?? 'Free focus'}
                </p>
                <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{topic?.name ?? 'Deep work'}</h1>
                {candidates.length > 0 && (
                  <label className="mt-2 inline-flex items-center gap-2 text-xs text-white/60">
                    <span className="sr-only">Choose session</span>
                    <select
                      value={sessionId ?? ''}
                      onChange={(e) => setSessionId(e.target.value || null)}
                      disabled={running}
                      className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-white disabled:opacity-50"
                    >
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id} className="bg-[#0B1020]">
                          {d?.topicById.get(c.topicId)?.name} · {relativeDay(c.date)} {formatTime(c.start)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {/* Breathing orbit */}
              <div className="relative grid h-[300px] w-[300px] place-items-center sm:h-[340px] sm:w-[340px]">
                <svg viewBox="0 0 300 300" className="absolute inset-0 h-full w-full" aria-hidden>
                  <circle cx="150" cy="150" r={R} fill="none" stroke="white" strokeOpacity="0.08" strokeWidth="2" />
                  <motion.circle
                    cx="150"
                    cy="150"
                    r={R}
                    fill="none"
                    stroke={color}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={C}
                    animate={{ strokeDashoffset: C * (1 - progress) }}
                    transition={{ duration: 0.3 }}
                    transform="rotate(-90 150 150)"
                    style={{ filter: `drop-shadow(0 0 8px ${color})` }}
                  />
                  {/* orbiting planet marks progress */}
                  <g transform={`rotate(${progress * 360 - 90} 150 150)`}>
                    <circle cx={150 + R} cy="150" r="7" fill="white" style={{ filter: `drop-shadow(0 0 10px ${color})` }} />
                  </g>
                </svg>
                <motion.div
                  aria-hidden
                  className="absolute h-40 w-40 rounded-full"
                  style={{ background: `radial-gradient(circle, ${color}aa, ${color}22 60%, transparent 70%)` }}
                  animate={reduce ? undefined : breathing ? { scale: [0.85, 1.15, 0.85] } : { scale: [0.98, 1.02, 0.98] }}
                  transition={{ duration: breathing ? 8 : 3, repeat: Infinity, ease: 'easeInOut' }}
                />
                <div className="relative text-center" aria-live="off">
                  <p className="font-mono text-6xl font-bold tabular-nums tracking-tight" role="timer" aria-label={`${mm} minutes ${ss} seconds left in ${phase}`}>
                    {mm}:{ss}
                  </p>
                  <p className="mt-2 flex items-center justify-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.25em] text-white/70">
                    {phase === 'break' ? (
                      <>
                        <Coffee className="h-3.5 w-3.5" /> break · breathe
                      </>
                    ) : running ? (
                      'focus'
                    ) : (
                      'ready'
                    )}
                  </p>
                </div>
              </div>

              <p className="font-mono text-xs text-white/60" aria-live="polite">
                {formatDuration(Math.floor(focused / 60))} of {formatDuration(target / 60)} focused · {Math.round(progress * 100)}%
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  whileHover={{ scale: 1.04 }}
                  onClick={() => (running ? setRunning(false) : start())}
                  className="grid h-16 w-16 place-items-center rounded-full text-[#0B1020] shadow-2xl"
                  style={{ background: `linear-gradient(135deg, white, ${color})`, boxShadow: `0 0 40px ${color}88` }}
                  aria-label={running ? 'Pause' : 'Start'}
                >
                  {running ? <Pause className="h-7 w-7" fill="currentColor" /> : <Play className="ml-1 h-7 w-7" fill="currentColor" />}
                </motion.button>
                <IconButton label="Skip to next phase" onClick={skipPhase} className="h-12 w-12 text-white/70 hover:bg-white/10 hover:text-white">
                  <SkipForward className="h-5 w-5" />
                </IconButton>
              </div>
              {session && (
                <Button variant="ghost" size="sm" icon={<Flag className="h-4 w-4" />} className="text-white/70 hover:bg-white/10 hover:text-white" disabled={focused < 60} onClick={() => void finish(true)}>
                  Finish early & log {Math.max(1, Math.round(focused / 60))} min
                </Button>
              )}
              <p className="text-[11px] text-white/40">Space to start/pause · Esc to exit</p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </motion.div>
  );
}

/** "Session complete" — the topic's star ignites. */
function Ignition({ color, topicName, minutes, onClose }: { color: string; topicName: string; minutes: number; onClose: () => void }) {
  const rays = Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-6 text-center" role="status">
      <div className="relative grid h-72 w-72 place-items-center">
        {[0, 0.3, 0.6].map((delay) => (
          <motion.span key={delay} className="absolute rounded-full border-2" style={{ borderColor: color }} initial={{ width: 20, height: 20, opacity: 1 }} animate={{ width: 280, height: 280, opacity: 0 }} transition={{ duration: 1.6, delay, ease: 'easeOut' }} />
        ))}
        <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden>
          {rays.map((a, i) => (
            <motion.line
              key={i}
              x1={100}
              y1={100}
              stroke={i % 2 ? color : 'white'}
              strokeWidth={2}
              strokeLinecap="round"
              initial={{ x2: 100, y2: 100, opacity: 1 }}
              animate={{ x2: 100 + Math.cos(a) * 90, y2: 100 + Math.sin(a) * 90, opacity: 0 }}
              transition={{ duration: 1.1, delay: 0.2 }}
            />
          ))}
        </svg>
        <motion.div
          className="h-16 w-16 rounded-full bg-white"
          initial={{ scale: 0.2 }}
          animate={{ scale: [0.2, 1.6, 1] }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          style={{ boxShadow: `0 0 60px 20px ${color}, 0 0 120px 40px ${color}66` }}
        />
      </div>
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.3em]" style={{ color }}>
          Star ignited
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold">{topicName} burns brighter</h2>
        <p className="mt-2 text-sm text-white/70">{formatDuration(minutes)} of deep focus logged. Take a breath — you earned it.</p>
      </div>
      <Button size="lg" onClick={onClose}>
        Back to my sky
      </Button>
    </motion.div>
  );
}
