import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Battery,
  CheckCircle2,
  CornerDownLeft,
  FastForward,
  FlaskConical,
  GraduationCap,
  ListTodo,
  LogOut,
  Moon,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  ZapOff,
} from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useDataStore } from '@/store/useDataStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useDerived } from '@/hooks/useDerived';
import { NAV } from '@/components/layout/nav';
import { Kbd } from '@/components/ui/Feedback';
import { cn } from '@/lib/utils';

interface Command {
  id: string;
  group: 'Actions' | 'Navigate' | 'Topics' | 'Demo';
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void | Promise<unknown>;
}

/** Simple subsequence fuzzy score; higher is better, -1 means no match. */
function fuzzy(q: string, text: string): number {
  if (!q) return 0;
  const t = text.toLowerCase();
  const query = q.toLowerCase();
  const idx = t.indexOf(query);
  if (idx >= 0) return 100 - idx;
  let ti = 0;
  let score = 0;
  for (const ch of query) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    score += found === ti ? 2 : 1;
    ti = found + 1;
  }
  return score;
}

/** Command palette (Ctrl/Cmd+K): navigation, quick actions, topic search. */
export function CommandPalette() {
  const open = useUIStore((s) => s.paletteOpen);
  const setOpen = useUIStore((s) => s.setPaletteOpen);
  return createPortal(<AnimatePresence>{open && <Palette onClose={() => setOpen(false)} />}</AnimatePresence>, document.body);
}

function Palette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const d = useDerived();
  const ui = useUIStore();
  const data = useDataStore();
  const logout = useAuthStore((s) => s.logout);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => navigate(to);
    const next = d?.nextSession;
    const nextName = next ? d?.topicById.get(next.topicId)?.name : undefined;
    const cmds: Command[] = [
      { id: 'focus', group: 'Actions', label: 'Start focus session', hint: nextName, icon: <Play className="h-4 w-4" />, keywords: 'pomodoro timer', run: () => ui.openFocus(next?.id ?? null) },
      ...(next
        ? [{ id: 'done', group: 'Actions' as const, label: `Mark done: ${nextName}`, icon: <CheckCircle2 className="h-4 w-4" />, keywords: 'complete finish session', run: () => data.setSessionStatus(next.id, 'completed') }]
        : []),
      { id: 'add-exam', group: 'Actions', label: 'Add exam', icon: <GraduationCap className="h-4 w-4" />, keywords: 'new test', run: go('/exams?new=exam') },
      { id: 'add-asg', group: 'Actions', label: 'Add assignment', icon: <ListTodo className="h-4 w-4" />, keywords: 'new homework due', run: go('/exams?new=assignment') },
      { id: 'add-achievement', group: 'Actions', label: 'Add an achievement', icon: <Star className="h-4 w-4" />, keywords: 'marks grade passed award win', run: go('/achievements?new=1') },
      { id: 'add-subject', group: 'Actions', label: 'Add subject', icon: <Plus className="h-4 w-4" />, keywords: 'new course constellation', run: go('/subjects?new=1') },
      { id: 'generate', group: 'Actions', label: 'Generate study plan', icon: <Sparkles className="h-4 w-4" />, keywords: 'schedule plan regenerate', run: () => { navigate('/plan'); return data.generatePlan(); } },
      { id: 'mood', group: 'Actions', label: 'Check in mood & energy', icon: <Battery className="h-4 w-4" />, keywords: 'tired energized drained', run: () => ui.setMoodOpen(true) },
      { id: 'theme', group: 'Actions', label: `Switch to ${ui.theme === 'midnight' ? 'Dawn' : 'Midnight'} theme`, icon: <Moon className="h-4 w-4" />, keywords: 'dark light appearance', run: ui.toggleTheme },
      ...NAV.map((n) => ({ id: `nav-${n.to}`, group: 'Navigate' as const, label: `Go to ${n.label}`, icon: <n.icon className="h-4 w-4" />, run: go(n.to) })),
      { id: 'miss', group: 'Demo', label: 'Simulate a missed session', icon: <ZapOff className="h-4 w-4" />, keywords: 'demo reflow living schedule', run: () => { navigate('/plan'); return data.simulateMiss(); } },
      { id: 'ff', group: 'Demo', label: 'Fast-forward one day', icon: <FastForward className="h-4 w-4" />, keywords: 'demo time travel', run: async () => { navigate('/plan'); ui.shiftClock(1); await data.rollover(); } },
      { id: 'demo', group: 'Demo', label: `${ui.demoMode ? 'Hide' : 'Show'} demo controls`, icon: <FlaskConical className="h-4 w-4" />, run: () => ui.setDemoMode(!ui.demoMode) },
      { id: 'reset', group: 'Demo', label: 'Reset demo data', icon: <RotateCcw className="h-4 w-4" />, run: () => data.resetDemo() },
      { id: 'logout', group: 'Actions', label: 'Log out', icon: <LogOut className="h-4 w-4" />, run: async () => { await logout(); data.clear(); navigate('/login'); } },
    ];
    for (const t of d?.snapshot.topics ?? []) {
      const subj = d?.subjectById.get(t.subjectId);
      cmds.push({
        id: `topic-${t.id}`,
        group: 'Topics',
        label: t.name,
        hint: subj?.name,
        icon: <Star className="h-4 w-4" style={{ color: subj?.color }} />,
        run: go(`/subjects?subject=${t.subjectId}&topic=${t.id}`),
      });
    }
    return cmds;
  }, [d, ui, data, navigate, logout]);

  const results = useMemo(() => {
    if (!q.trim()) return commands.filter((c) => c.group !== 'Topics');
    return commands
      .map((c) => ({ c, s: Math.max(fuzzy(q, c.label), fuzzy(q, `${c.keywords ?? ''} ${c.hint ?? ''}`) - 5) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c)
      .slice(0, 30);
  }, [q, commands]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const exec = (c?: Command) => {
    if (!c) return;
    onClose();
    void c.run();
  };

  const groups = results.reduce<Record<string, { c: Command; i: number }[]>>((acc, c, i) => {
    (acc[c.group] ||= []).push({ c, i });
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center p-4 pt-[12vh]">
      <motion.div className="absolute inset-0 bg-[rgb(var(--bg-0)/0.65)] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.16 }}
        className="glass-strong relative w-full max-w-xl overflow-hidden"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            exec(results[active]);
          }
        }}
      >
        <div className="flex items-center gap-3 border-b border-line/10 px-4">
          <Search className="h-4 w-4 text-muted" aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a command or search topics…"
            className="h-14 flex-1 bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
            aria-label="Search commands"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul ref={list} id="palette-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">No matches in this galaxy.</li>}
          {Object.entries(groups).map(([group, items]) => (
            <li key={group} role="presentation">
              <p className="eyebrow px-3 pb-1 pt-3">{group}</p>
              <ul role="presentation">
                {items.map(({ c, i }) => (
                  <li
                    key={c.id}
                    id={`cmd-${c.id}`}
                    role="option"
                    aria-selected={i === active}
                    data-index={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => exec(c)}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors', i === active ? 'bg-violet/15 text-ink' : 'text-muted')}
                  >
                    <span className={cn('grid h-7 w-7 place-items-center rounded-lg', i === active ? 'bg-violet/20 text-violet' : 'bg-line/[0.06]')}>{c.icon}</span>
                    <span className="flex-1 truncate">{c.label}</span>
                    {c.hint && <span className="truncate text-xs text-faint">{c.hint}</span>}
                    {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-faint" aria-hidden />}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}
