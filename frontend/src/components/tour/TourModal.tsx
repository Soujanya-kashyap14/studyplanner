import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, CalendarRange, Play, RefreshCw } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const STEPS = [
  {
    icon: <BookOpen className="h-6 w-6" />,
    color: 'text-violet',
    title: '1. Tell Orbit what you study',
    text: 'Add subjects, split them into topics with rough hours ("Arrays, 3h"), add exam dates, and set the hours you can study each week.',
  },
  {
    icon: <CalendarRange className="h-6 w-6" />,
    color: 'text-cyan',
    title: '2. Generate your plan',
    text: 'Orbit splits topics into focused sessions and places them in your study hours — whatever is due soonest, hardest and least finished goes first.',
  },
  {
    icon: <Play className="h-6 w-6" />,
    color: 'text-mint',
    title: '3. Study and tick it off',
    text: 'Home always shows your next best action. Press Start for a focus timer, then Done. Can’t make it? Press Skip.',
  },
  {
    icon: <RefreshCw className="h-6 w-6" />,
    color: 'text-amber',
    title: '4. Orbit adapts for you',
    text: 'Skipped or finished early? Changed your hours? The plan rearranges itself before your deadlines, and "Plan updates" explains every move.',
  },
];

/** "How Orbit works" — a 4-step tour. Shown once after setup; reopen any time from the avatar menu. */
export function TourModal() {
  const open = useUIStore((s) => s.tourOpen);
  const setOpen = useUIStore((s) => s.setTourOpen);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (open) setI(0);
  }, [open]);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="How Orbit works"
      description={`Step ${i + 1} of ${STEPS.length}`}
      footer={
        <>
          {i > 0 && (
            <Button variant="ghost" onClick={() => setI(i - 1)}>
              Back
            </Button>
          )}
          <Button onClick={() => (last ? setOpen(false) : setI(i + 1))}>{last ? 'Got it' : 'Next'}</Button>
        </>
      }
    >
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }} className="flex gap-4">
          <span className={cn('grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-line/[0.06]', step.color)} aria-hidden>
            {step.icon}
          </span>
          <div>
            <h3 className="text-base font-semibold text-ink">{step.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.text}</p>
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="mt-6 flex justify-center gap-2" aria-hidden>
        {STEPS.map((_, j) => (
          <span key={j} className={cn('h-1.5 rounded-full transition-all', j === i ? 'w-6 bg-violet' : 'w-1.5 bg-line/20')} />
        ))}
      </div>
    </Modal>
  );
}
