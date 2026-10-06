import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BatteryLow, BatteryMedium, Loader2, Zap } from 'lucide-react';
import type { Mood } from '@/types';
import { useUIStore } from '@/store/useUIStore';
import { useDataStore } from '@/store/useDataStore';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { todayISO } from '@/lib/date';
import { cn } from '@/lib/utils';

const OPTIONS: { mood: Mood; label: string; hint: string; icon: JSX.Element; cls: string }[] = [
  { mood: 'energized', label: 'Energized', hint: 'Bring on the hard stuff', icon: <Zap className="h-7 w-7" />, cls: 'text-amber border-amber/40 hover:bg-amber/10 data-[on=true]:bg-amber/15' },
  { mood: 'okay', label: 'Okay', hint: 'Steady, normal day', icon: <BatteryMedium className="h-7 w-7" />, cls: 'text-cyan border-cyan/40 hover:bg-cyan/10 data-[on=true]:bg-cyan/15' },
  { mood: 'drained', label: 'Drained', hint: 'Go easy on me today', icon: <BatteryLow className="h-7 w-7" />, cls: 'text-rose border-rose/40 hover:bg-rose/10 data-[on=true]:bg-rose/15' },
];

/**
 * Mood & Energy check-in. The scheduler lightens or rearranges today
 * and explains what it did in plain language.
 */
export function MoodCheckIn() {
  const open = useUIStore((s) => s.moodOpen);
  const setOpen = useUIStore((s) => s.setMoodOpen);
  const setHandled = useUIStore((s) => s.setMoodHandled);
  const checkIn = useDataStore((s) => s.checkInMood);
  const current = useDataStore((s) => s.snapshot?.moods.find((m) => m.date === todayISO())?.mood);
  const [picked, setPicked] = useState<Mood | null>(null);
  const [busy, setBusy] = useState(false);
  const [explanation, setExplanation] = useState<string[] | null>(null);

  useEffect(() => {
    if (open) {
      setPicked(null);
      setExplanation(null);
    }
  }, [open]);

  const close = () => {
    setHandled(todayISO());
    setOpen(false);
  };

  async function choose(m: Mood) {
    setPicked(m);
    setBusy(true);
    const lines = await checkIn(m);
    setBusy(false);
    setExplanation(lines ?? ['Saved. Your plan is unchanged.']);
  }

  return (
    <Modal open={open} onClose={close} title={explanation ? 'Plan adjusted' : 'How is your energy today?'} description={explanation ? undefined : 'Orbit shapes today around how you actually feel.'}>
      <AnimatePresence mode="wait">
        {!explanation ? (
          <motion.div key="pick" exit={{ opacity: 0, y: -8 }} className="grid grid-cols-3 gap-2 sm:gap-3" role="radiogroup" aria-label="Energy level">
            {OPTIONS.map((o, i) => (
              <motion.button
                key={o.mood}
                role="radio"
                aria-checked={picked === o.mood || (!picked && current === o.mood)}
                data-on={picked === o.mood || (!picked && current === o.mood)}
                disabled={busy}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, transition: { delay: i * 0.06 } }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => void choose(o.mood)}
                className={cn('flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-colors sm:p-5', o.cls)}
              >
                {busy && picked === o.mood ? <Loader2 className="h-7 w-7 animate-spin" /> : o.icon}
                <span className="text-sm font-semibold text-ink">{o.label}</span>
                <span className="hidden text-[11px] text-muted sm:block">{o.hint}</span>
              </motion.button>
            ))}
          </motion.div>
        ) : (
          <motion.div key="explain" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <ul className="space-y-2.5" aria-live="polite">
              {explanation.map((l, i) => (
                <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0, transition: { delay: 0.1 + i * 0.12 } }} className="flex gap-3 rounded-2xl border border-line/10 bg-line/[0.03] p-3 text-sm text-ink">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan" aria-hidden />
                  {l}
                </motion.li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setExplanation(null)}>
                Change answer
              </Button>
              <Button onClick={close}>Sounds good</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!explanation && (
        <div className="mt-5 flex justify-end">
          <Button variant="ghost" size="sm" onClick={close}>
            Skip today
          </Button>
        </div>
      )}
    </Modal>
  );
}
