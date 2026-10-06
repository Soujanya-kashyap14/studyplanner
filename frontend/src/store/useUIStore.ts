import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ID } from '@/types';
import { setClockOffset } from '@/lib/clock';
import { uid } from '@/lib/utils';

export type Theme = 'midnight' | 'dawn';
export type ToastTone = 'success' | 'info' | 'warning' | 'danger' | 'achievement';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
  /** Extra actions shown next to `action` (e.g. Undo). */
  actions?: { label: string; onClick: () => void }[];
  duration?: number;
}

interface UIState {
  theme: Theme;
  /** In-app reduced motion toggle (OR'ed with the OS preference). */
  reducedMotion: boolean;
  /** Demo Mode: shows the time-travel controls. */
  demoMode: boolean;
  clockOffsetDays: number;
  /** Day the mood prompt was answered or dismissed (YYYY-MM-DD). */
  moodPromptHandledOn: string | null;
  /** Desktop sidebar collapsed to icons only. */
  sidebarCollapsed: boolean;
  /** Newest plan-update log the user has opened (drives the "Plan updates (n)" badge). */
  lastSeenLogId: string | null;
  /** The "How Orbit works" tour has been shown once. */
  tourSeen: boolean;

  // Ephemeral (not persisted)
  paletteOpen: boolean;
  focusSessionId: ID | null;
  focusOpen: boolean;
  moodOpen: boolean;
  toasts: Toast[];
  celebrate: { achievementId: ID } | null;
  tourOpen: boolean;

  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setReducedMotion: (v: boolean) => void;
  setDemoMode: (v: boolean) => void;
  shiftClock: (days: number) => void;
  resetClock: () => void;
  setMoodHandled: (day: string) => void;
  setPaletteOpen: (v: boolean) => void;
  openFocus: (sessionId?: ID | null) => void;
  closeFocus: () => void;
  setMoodOpen: (v: boolean) => void;
  toast: (t: Omit<Toast, 'id'>) => string;
  dismissToast: (id: string) => void;
  setCelebrate: (c: UIState['celebrate']) => void;
  toggleSidebar: () => void;
  markLogsSeen: (id: string | null) => void;
  setTourOpen: (v: boolean) => void;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'midnight' ? '#0B1020' : '#FFF7EF');
}

function applyMotion(reduce: boolean) {
  document.documentElement.classList.toggle('reduce-motion', reduce);
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: 'midnight',
      reducedMotion: false,
      demoMode: true,
      clockOffsetDays: 0,
      moodPromptHandledOn: null,
      sidebarCollapsed: false,
      lastSeenLogId: null,
      tourSeen: false,
      tourOpen: false,
      paletteOpen: false,
      focusSessionId: null,
      focusOpen: false,
      moodOpen: false,
      toasts: [],
      celebrate: null,

      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleTheme: () => get().setTheme(get().theme === 'midnight' ? 'dawn' : 'midnight'),
      setReducedMotion: (reducedMotion) => {
        applyMotion(reducedMotion);
        set({ reducedMotion });
      },
      setDemoMode: (demoMode) => set({ demoMode }),
      shiftClock: (days) => {
        const clockOffsetDays = get().clockOffsetDays + days;
        setClockOffset(clockOffsetDays);
        set({ clockOffsetDays });
      },
      resetClock: () => {
        setClockOffset(0);
        set({ clockOffsetDays: 0 });
      },
      setMoodHandled: (day) => set({ moodPromptHandledOn: day }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      openFocus: (sessionId = null) => set({ focusOpen: true, focusSessionId: sessionId }),
      closeFocus: () => set({ focusOpen: false }),
      setMoodOpen: (moodOpen) => set({ moodOpen }),
      toast: (t) => {
        const id = uid('toast');
        set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
        window.setTimeout(() => get().dismissToast(id), t.duration ?? (t.action ? 7000 : 4500));
        return id;
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      setCelebrate: (celebrate) => set({ celebrate }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      markLogsSeen: (lastSeenLogId) => set({ lastSeenLogId }),
      setTourOpen: (tourOpen) => set(tourOpen ? { tourOpen } : { tourOpen, tourSeen: true }),
    }),
    {
      name: 'orbit.ui',
      partialize: (s) => ({
        theme: s.theme,
        reducedMotion: s.reducedMotion,
        demoMode: s.demoMode,
        clockOffsetDays: s.clockOffsetDays,
        moodPromptHandledOn: s.moodPromptHandledOn,
        sidebarCollapsed: s.sidebarCollapsed,
        lastSeenLogId: s.lastSeenLogId,
        tourSeen: s.tourSeen,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        applyTheme(state.theme);
        applyMotion(state.reducedMotion);
        setClockOffset(state.clockOffsetDays);
      },
    },
  ),
);

/** Imperative toast helper usable outside React. */
export const toast = (t: Omit<Toast, 'id'>) => useUIStore.getState().toast(t);
