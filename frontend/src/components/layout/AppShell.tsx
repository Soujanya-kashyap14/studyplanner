import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar, SIDEBAR_W } from './Sidebar';
import { TourModal } from '@/components/tour/TourModal';
import { TopBar } from './TopBar';
import { MobileDock } from './MobileDock';
import { useDataStore } from '@/store/useDataStore';
import { useUIStore } from '@/store/useUIStore';
import { useHotkey } from '@/hooks/useHotkeys';
import { todayISO } from '@/lib/date';
import { CommandPalette } from '@/components/command/CommandPalette';
import { FocusMode } from '@/components/focus/FocusMode';
import { MoodCheckIn } from '@/components/mood/MoodCheckIn';
import { ErrorState } from '@/components/ui/ErrorState';
import { useAuthStore } from '@/store/useAuthStore';
import { isSetupSkipped } from '@/lib/setupFlags';

/** Keeps the outgoing page rendered during its exit animation. */
function AnimatedOutlet() {
  const outlet = useOutlet();
  const [frozen] = useState(outlet);
  return frozen;
}

/**
 * Authenticated app frame: floating icon rail (desktop), top bar, mobile dock,
 * page transitions, and global overlays (palette, focus mode, mood check-in).
 */
export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const status = useDataStore((s) => s.status);
  const error = useDataStore((s) => s.error);
  const snapshot = useDataStore((s) => s.snapshot);
  const load = useDataStore((s) => s.load);
  const rollover = useDataStore((s) => s.rollover);
  const setPalette = useUIStore((s) => s.setPaletteOpen);
  const setMoodOpen = useUIStore((s) => s.setMoodOpen);
  const moodHandled = useUIStore((s) => s.moodPromptHandledOn);
  const rolledOver = useRef(false);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const tourSeen = useUIStore((s) => s.tourSeen);
  const setTourOpen = useUIStore((s) => s.setTourOpen);

  // First time someone has data: a short "How Orbit works" tour (reopen from the avatar menu).
  useEffect(() => {
    if (tourSeen || !snapshot || snapshot.subjects.length === 0) return;
    const t = window.setTimeout(() => setTourOpen(true), 900);
    return () => window.clearTimeout(t);
  }, [tourSeen, snapshot, setTourOpen]);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  // Brand-new (empty) accounts start with guided setup unless they chose to skip it.
  const userId = useAuthStore((s) => s.user?.id);
  useEffect(() => {
    if (!snapshot || snapshot.subjects.length > 0 || location.pathname === '/settings') return;
    if (!isSetupSkipped(userId)) navigate('/setup', { replace: true });
  }, [snapshot, userId, location.pathname, navigate]);

  // Day rollover: sessions left "planned" in the past are treated as missed and reflowed.
  useEffect(() => {
    if (!snapshot || rolledOver.current) return;
    rolledOver.current = true;
    const today = todayISO();
    if (snapshot.sessions.some((s) => s.status === 'planned' && s.date < today)) void rollover();
  }, [snapshot, rollover]);

  // Daily mood prompt: once per day, only on the Dashboard, and only when there is
  // something today to adapt — never as an interruption elsewhere (Check in stays in the top bar).
  useEffect(() => {
    if (!snapshot || location.pathname !== '/') return;
    const today = todayISO();
    if (!tourSeen || moodHandled === today || snapshot.moods.some((m) => m.date === today)) return;
    if (!snapshot.sessions.some((s) => s.date === today && s.status === 'planned')) return;
    const t = window.setTimeout(() => setMoodOpen(true), 1400);
    return () => window.clearTimeout(t);
  }, [snapshot, moodHandled, setMoodOpen, location.pathname, tourSeen]);

  // Toast actions navigate through this event so stores stay router-agnostic.
  useEffect(() => {
    const on = (e: Event) => navigate((e as CustomEvent<string>).detail);
    window.addEventListener('orbit:navigate', on);
    return () => window.removeEventListener('orbit:navigate', on);
  }, [navigate]);

  useHotkey('mod+k', (e) => {
    e.preventDefault();
    setPalette(true);
  });

  // Move focus to main content on route change for screen readers.
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    main.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-dvh" style={{ ['--sidebar-w' as string]: `${sidebarCollapsed ? SIDEBAR_W.collapsed : SIDEBAR_W.expanded}px` }}>
      <a href="#main" className="sr-only-focusable fixed left-4 top-4 z-[90] rounded-xl bg-violet px-4 py-2 text-sm font-semibold text-on-accent">
        Skip to content
      </a>
      <Sidebar />
      <TopBar />
      {/* --sidebar-w is set by the navigation; header and content both offset by it */}
      <div className="pb-28 pt-[96px] lg:pb-12 lg:pl-[var(--sidebar-w)]">
        <main id="main" ref={main} tabIndex={-1} className="mx-auto w-full max-w-[1280px] px-4 outline-none sm:px-6 lg:px-8">
          {status === 'error' ? (
            <ErrorState message={error ?? undefined} onRetry={() => void load()} />
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
                exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
              >
                <AnimatedOutlet />
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>
      <MobileDock />
      <CommandPalette />
      <FocusMode />
      <MoodCheckIn />
      <TourModal />
    </div>
  );
}
