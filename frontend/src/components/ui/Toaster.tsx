import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, Sparkles, X, XCircle } from 'lucide-react';
import { useUIStore, type ToastTone } from '@/store/useUIStore';
import { cn } from '@/lib/utils';

const icon: Record<ToastTone, JSX.Element> = {
  success: <CheckCircle2 className="h-5 w-5 text-mint" aria-hidden />,
  info: <Info className="h-5 w-5 text-cyan" aria-hidden />,
  warning: <AlertTriangle className="h-5 w-5 text-amber" aria-hidden />,
  danger: <XCircle className="h-5 w-5 text-rose" aria-hidden />,
  achievement: <Sparkles className="h-5 w-5 text-amber" aria-hidden />,
};

const accent: Record<ToastTone, string> = {
  success: 'before:bg-mint',
  info: 'before:bg-cyan',
  warning: 'before:bg-amber',
  danger: 'before:bg-rose',
  achievement: 'before:bg-[linear-gradient(180deg,rgb(var(--amber)),rgb(var(--violet)))]',
};

/** Toast stack. Polite live region; danger toasts are assertive. */
export function Toaster() {
  const toasts = useUIStore((s) => s.toasts);
  const dismiss = useUIStore((s) => s.dismissToast);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex flex-col items-center gap-2 px-4 md:bottom-6 md:left-auto md:right-6 md:items-end"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            role={t.tone === 'danger' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className={cn(
              'glass-strong pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-2xl py-3 pl-5 pr-3',
              "before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']",
              accent[t.tone],
            )}
          >
            <span className="mt-0.5">{icon[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-muted">{t.description}</p>}
              {(t.action || t.actions?.length) && (
                <div className="mt-2 flex flex-wrap gap-3">
                  {[...(t.action ? [t.action] : []), ...(t.actions ?? [])].map((a) => (
                    <button
                      key={a.label}
                      onClick={() => {
                        a.onClick();
                        dismiss(t.id);
                      }}
                      className="text-xs font-semibold text-cyan underline-offset-4 hover:underline"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="rounded-lg p-1 text-faint hover:bg-line/[0.07] hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
