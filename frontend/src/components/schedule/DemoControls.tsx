import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, FastForward, FlaskConical, RotateCcw, ZapOff } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { useUIStore } from '@/store/useUIStore';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const OPEN_KEY = 'orbit.demoToolsOpen';
const readOpen = () => {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Demo Mode controls: show the Living Schedule reflow on demand.
 * - Miss next session: marks the next planned session missed → reflow
 * - Fast-forward 1 day: advances the app clock; yesterday's unfinished sessions become missed → reflow
 * `collapsible` renders a labelled disclosure so the tools don't compete with real actions.
 */
export function DemoControls({ className, collapsible = false }: { className?: string; collapsible?: boolean }) {
  const demo = useUIStore((s) => s.demoMode);
  const shift = useUIStore((s) => s.shiftClock);
  const resetClock = useUIStore((s) => s.resetClock);
  const offset = useUIStore((s) => s.clockOffsetDays);
  const simulate = useDataStore((s) => s.simulateMiss);
  const rollover = useDataStore((s) => s.rollover);
  const pending = useDataStore((s) => s.pending);
  const [open, setOpen] = useState(() => !collapsible || readOpen() || offset !== 0);
  if (!demo) return null;

  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(OPEN_KEY, o ? '0' : '1');
      } catch {
        /* storage unavailable — fine */
      }
      return !o;
    });
  };

  const tools = (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <ToolButton
        icon={<ZapOff className="h-4 w-4" />}
        label="Miss the next session"
        hint="Watch the plan reflow around it"
        loading={pending.simulate}
        onClick={() => void simulate()}
      />
      <ToolButton
        icon={<FastForward className="h-4 w-4" />}
        label="Jump to tomorrow"
        hint="Unfinished sessions count as missed"
        loading={pending.rollover}
        onClick={async () => {
          shift(1);
          await rollover();
        }}
      />
      {offset !== 0 && (
        <ToolButton icon={<RotateCcw className="h-4 w-4" />} label={`Back to real time (now +${offset}d)`} hint="Your data stays as it is" onClick={resetClock} />
      )}
    </div>
  );

  if (!collapsible) {
    return (
      <div className={cn('rounded-2xl border border-dashed border-amber/40 bg-amber/[0.06] p-3', className)} role="group" aria-label="Demo controls">
        {tools}
      </div>
    );
  }

  return (
    <div className={cn('rounded-2xl border border-dashed border-amber/35 bg-amber/[0.04]', className)}>
      <button onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-2.5 text-left">
        <FlaskConical className="h-4 w-4 text-amber" aria-hidden />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-amber">Demo tools</span>
        <span className="hidden text-xs text-muted sm:inline">— simulate real life to see the plan adapt</span>
        {offset !== 0 && <span className="rounded-full bg-amber/15 px-2 py-0.5 font-mono text-[10px] text-amber">clock +{offset}d</span>}
        <ChevronDown className={cn('ml-auto h-4 w-4 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden" role="group" aria-label="Demo controls">
            <div className="px-3 pb-3">{tools}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ToolButton({ icon, label, hint, onClick, loading }: { icon: JSX.Element; label: string; hint: string; onClick: () => void; loading?: boolean }) {
  return (
    <Button variant="secondary" className="h-auto justify-start whitespace-normal py-2.5 text-left" icon={<span className="text-amber">{icon}</span>} loading={loading} onClick={onClick}>
      <span className="flex flex-col">
        <span>{label}</span>
        <span className="text-[11px] font-normal text-muted">{hint}</span>
      </span>
    </Button>
  );
}
