import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarRange, MoreHorizontal, Home, Play, BookOpen } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useDerived } from '@/hooks/useDerived';
import { NAV, NAV_GROUPS } from './nav';
import { cn } from '@/lib/utils';

const dockItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/plan', label: 'Plan', icon: CalendarRange },
  null, // center Focus button
  { to: '/subjects', label: 'Subjects', icon: BookOpen },
] as const;

/** Mobile bottom dock with a floating center "Start Focus" button and a "More" sheet. */
export function MobileDock() {
  const openFocus = useUIStore((s) => s.openFocus);
  const d = useDerived();
  const [more, setMore] = useState(false);
  const navigate = useNavigate();
  const extra = NAV.filter((n) => !['/', '/plan', '/subjects'].includes(n.to));

  return (
    <>
      <nav aria-label="Primary" className="fixed inset-x-3 bottom-3 z-40 lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="glass-strong relative flex h-16 items-center justify-around rounded-[26px] px-2">
          {dockItems.map((item) =>
            item === null ? (
              <motion.button
                key="focus"
                whileTap={{ scale: 0.9 }}
                onClick={() => openFocus(d?.nextSession?.id ?? null)}
                aria-label="Start focus session"
                className="relative -mt-9 grid h-16 w-16 place-items-center rounded-full bg-[linear-gradient(135deg,rgb(var(--violet)),rgb(var(--cyan)))] text-on-accent shadow-glow ring-4 ring-[rgb(var(--bg-0))]"
              >
                <span className="absolute inset-0 animate-ping rounded-full bg-violet/20 [animation-duration:2.6s]" aria-hidden />
                <Play className="relative h-6 w-6" fill="currentColor" aria-hidden />
                <span className="absolute -bottom-5 text-[10px] font-semibold text-ink">Focus</span>
              </motion.button>
            ) : (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className="relative flex w-16 flex-col items-center gap-0.5 py-1">
                {({ isActive }) => (
                  <>
                    <item.icon className={cn('h-5 w-5 transition-colors', isActive ? 'text-ink' : 'text-muted')} aria-hidden strokeWidth={isActive ? 2.2 : 1.8} />
                    <span className={cn('text-[10px] font-medium', isActive ? 'text-ink' : 'text-muted')}>{item.label}</span>
                    {isActive && <motion.span layoutId="dock-dot" className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-cyan" />}
                  </>
                )}
              </NavLink>
            ),
          )}
          <button onClick={() => setMore(true)} className="flex w-16 flex-col items-center gap-0.5 py-1 text-muted" aria-haspopup="dialog" aria-expanded={more}>
            <MoreHorizontal className="h-5 w-5" aria-hidden />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {more && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More navigation">
            <motion.div className="absolute inset-0 bg-[rgb(var(--bg-0)/0.6)] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMore(false)} />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 40 }}
              className="glass-strong absolute inset-x-0 bottom-0 rounded-b-none rounded-t-3xl p-4 pb-8"
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line/20" />
              {(['setup', 'insights', 'account'] as const).map((g) => (
                <div key={g} className="mb-3">
                  <p className="eyebrow mb-2 px-1">{NAV_GROUPS[g]}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {extra
                      .filter((n) => n.group === g)
                      .map(({ to, label, hint, icon: Icon }) => (
                        <button
                          key={to}
                          onClick={() => {
                            setMore(false);
                            navigate(to);
                          }}
                          className="flex flex-col items-center gap-1.5 rounded-2xl border border-line/10 bg-line/[0.04] p-3 text-center text-xs font-medium text-ink"
                        >
                          <Icon className="h-5 w-5 text-violet" aria-hidden />
                          {label}
                          <span className="text-[10px] font-normal text-muted">{hint}</span>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
