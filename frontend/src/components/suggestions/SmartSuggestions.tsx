import { motion } from 'framer-motion';
import { Lightbulb, Plus, TrendingDown } from 'lucide-react';
import type { Derived } from '@/hooks/useDerived';
import { useDataStore } from '@/store/useDataStore';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { ProgressBar, SubjectDot } from '@/components/ui/Feedback';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

/** Smart Suggestions: weak subjects (low progress / many misses) with a one-click extra session. */
export function SmartSuggestions({ d, className, compact }: { d: Derived; className?: string; compact?: boolean }) {
  const add = useDataStore((s) => s.addExtraSession);
  const pending = useDataStore((s) => s.pending);

  return (
    <GlassCard
      className={className}
      eyebrow={
        <span className="flex items-center gap-1.5">
          <Lightbulb className="h-3 w-3 text-amber" aria-hidden /> Smart suggestions
        </span>
      }
      title={compact ? 'Suggestion' : 'Subjects that need more time'}
      hover={false}
    >
      {d.suggestions.length === 0 ? (
        <EmptyState compact art="planet" title="Balanced orbit" description="No subject is lagging. Keep the rhythm going." />
      ) : (
        <ul className="space-y-3">
          {(compact ? d.suggestions.slice(0, 1) : d.suggestions).map((s, i) => {
            const subj = d.subjectById.get(s.subjectId);
            const h = d.health.get(s.subjectId);
            return (
              <motion.li
                key={s.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className={cn(
                  'rounded-2xl border p-4',
                  s.severity === 'danger' ? 'border-rose/25 bg-rose/[0.06]' : s.severity === 'warning' ? 'border-amber/25 bg-amber/[0.06]' : 'border-line/10 bg-line/[0.03]',
                )}
              >
                <div className="flex items-start gap-3">
                  <TrendingDown className={cn('mt-0.5 h-4 w-4 shrink-0', s.severity === 'danger' ? 'text-rose' : 'text-amber')} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                      {subj && <SubjectDot color={subj.color} />}
                      {s.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{s.detail}</p>
                    {h && (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-faint">Progress {Math.round(h.progress * 100)}%</p>
                          <ProgressBar value={h.progress} color={subj?.color} label={`${subj?.name} progress`} height={5} />
                        </div>
                        <div>
                          <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-faint">Miss rate {Math.round(h.missRate * 100)}%</p>
                          <ProgressBar value={h.missRate} color="#FF7A90" label={`${subj?.name} miss rate`} height={5} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} loading={pending[`extra:${s.subjectId}`]} onClick={() => void add(s.subjectId)}>
                    Add a session
                  </Button>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
