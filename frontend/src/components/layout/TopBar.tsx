import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Battery, BatteryLow, Compass, FlaskConical, LogOut, Moon, Play, Search, Settings, Sun, Zap } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useDataStore } from '@/store/useDataStore';
import { useDerived } from '@/hooks/useDerived';
import { formatFullDate, formatMonthDay, formatWeekday } from '@/lib/date';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Feedback';
import { StreakFlame } from '@/components/achievements/StreakFlame';
import { LogoMark } from './Logo';
import { navLabelFor } from './nav';
import type { Mood } from '@/types';

const moodLabel: Record<Mood, { icon: JSX.Element; text: string }> = {
  energized: { icon: <Zap className="h-4 w-4 text-amber" aria-hidden />, text: 'Energized' },
  okay: { icon: <Battery className="h-4 w-4 text-cyan" aria-hidden />, text: 'Okay' },
  drained: { icon: <BatteryLow className="h-4 w-4 text-rose" aria-hidden />, text: 'Drained' },
};

/**
 * Top bar, kept deliberately small:
 * left = page name + today's date · right = Search, Start Focus, avatar menu.
 * Streak, energy check-in, theme, demo tools and the tour live in the avatar menu.
 */
export function TopBar() {
  const d = useDerived();
  const location = useLocation();
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const setPalette = useUIStore((s) => s.setPaletteOpen);
  const openFocus = useUIStore((s) => s.openFocus);
  const setMoodOpen = useUIStore((s) => s.setMoodOpen);
  const setTourOpen = useUIStore((s) => s.setTourOpen);
  const offset = useUIStore((s) => s.clockOffsetDays);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const clear = useDataStore((s) => s.clear);
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  const initials = (user?.name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const run = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };

  return (
    <header className="fixed inset-x-0 top-0 z-30 h-[72px] border-b border-line/[0.08] bg-[rgb(var(--bg-0)/0.88)] backdrop-blur-xl lg:pl-[var(--sidebar-w)]">
      <div className="mx-auto flex h-full w-full max-w-[1280px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="lg:hidden" aria-label="Orbit home">
          <LogoMark className="h-8 w-8" />
        </Link>

        {/* Left: where am I, what day is it */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-semibold text-ink">{navLabelFor(location.pathname)}</p>
          <p className="flex items-center gap-2 truncate text-xs text-muted">
            <span className="hidden sm:inline">{d ? formatFullDate(d.today) : ' '}</span>
            <span className="sm:hidden">{d ? `${formatWeekday(d.today)}, ${formatMonthDay(d.today)}` : ' '}</span>
            {offset !== 0 && (
              <span className="rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 font-mono text-[10px] font-medium text-amber" title="Demo mode: the clock has been moved forward">
                demo +{offset}d
              </span>
            )}
          </p>
        </div>

        {/* Right: Search · Start Focus · avatar */}
        <button
          onClick={() => setPalette(true)}
          className="flex h-10 items-center gap-2 rounded-xl border border-line/10 bg-line/[0.04] px-3 text-sm text-muted transition-colors hover:border-violet/30 hover:text-ink"
          aria-label="Search pages and actions"
          title={`Search pages and actions (${isMac ? '⌘' : 'Ctrl'}+K)`}
        >
          <Search className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Search</span>
          <span className="ml-2 hidden gap-0.5 md:flex">
            <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>

        <Button className="hidden sm:inline-flex" icon={<Play className="h-4 w-4" fill="currentColor" />} onClick={() => openFocus(d?.nextSession?.id ?? null)} title="Start a distraction-free focus timer for your next session">
          Start Focus
        </Button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenu((m) => !m)}
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label="Account menu"
            title="Account menu"
            className="grid h-10 w-10 place-items-center rounded-full bg-[linear-gradient(135deg,rgb(var(--violet)),rgb(var(--cyan)))] font-display text-xs font-bold text-on-accent ring-2 ring-line/10 transition-transform hover:scale-105"
          >
            {initials}
          </button>
          <AnimatePresence>
            {menu && (
              <motion.div
                role="menu"
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="glass-strong absolute right-0 top-12 w-72 rounded-2xl p-2"
              >
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-semibold text-ink">{user?.name}</p>
                  <p className="truncate text-xs text-muted">{user?.email}</p>
                </div>

                {/* Streak + energy at a glance */}
                <div className="mx-1 my-1 grid grid-cols-2 gap-2">
                  <button role="menuitem" onClick={run(() => navigate('/achievements'))} className="flex items-center gap-2 rounded-xl bg-amber/[0.08] px-3 py-2 text-left hover:bg-amber/15">
                    <StreakFlame streak={d?.streak ?? 0} size={20} />
                    <span>
                      <span className="block font-mono text-sm font-bold text-ink">{d?.streak ?? 0} days</span>
                      <span className="block text-[10px] text-muted">study streak</span>
                    </span>
                  </button>
                  <button role="menuitem" onClick={run(() => setMoodOpen(true))} className="flex items-center gap-2 rounded-xl bg-line/[0.05] px-3 py-2 text-left hover:bg-line/10">
                    {d?.todayMood ? moodLabel[d.todayMood].icon : <Battery className="h-4 w-4 text-muted" aria-hidden />}
                    <span>
                      <span className="block text-sm font-semibold text-ink">{d?.todayMood ? moodLabel[d.todayMood].text : 'Check in'}</span>
                      <span className="block text-[10px] text-muted">today&apos;s energy</span>
                    </span>
                  </button>
                </div>
                <div className="my-1 h-px bg-line/10" />
                <MenuItem icon={theme === 'midnight' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} onClick={run(toggleTheme)}>
                  Switch to {theme === 'midnight' ? 'Dawn (light)' : 'Midnight (dark)'} theme
                </MenuItem>
                <MenuItem icon={<Compass className="h-4 w-4" />} onClick={run(() => setTourOpen(true))}>
                  How Orbit works
                </MenuItem>
                <MenuItem icon={<FlaskConical className="h-4 w-4" />} onClick={run(() => navigate('/settings#demo'))}>
                  Demo tools
                </MenuItem>
                <MenuItem icon={<Settings className="h-4 w-4" />} onClick={run(() => navigate('/settings'))}>
                  Settings
                </MenuItem>
                <div className="my-1 h-px bg-line/10" />
                <MenuItem
                  icon={<LogOut className="h-4 w-4" />}
                  danger
                  onClick={run(async () => {
                    await logout();
                    clear();
                    navigate('/login');
                  })}
                >
                  Log out
                </MenuItem>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-muted ${danger ? 'hover:bg-rose/10 hover:text-rose' : 'hover:bg-line/[0.06] hover:text-ink'}`}
    >
      <span aria-hidden>{icon}</span>
      {children}
    </button>
  );
}
