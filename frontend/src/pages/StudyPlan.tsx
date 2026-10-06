import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutGroup, motion } from 'framer-motion';
import { BrainCircuit, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, History, ListOrdered, Sparkles } from 'lucide-react';
import type { ISODate, SlotRef, StudySession } from '@/types';
import { useDerived } from '@/hooks/useDerived';
import { useDataStore } from '@/store/useDataStore';
import { toast, useUIStore } from '@/store/useUIStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button, IconButton } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Form';
import { EmptyState } from '@/components/ui/EmptyState';
import { InfoTip } from '@/components/ui/InfoTip';
import { Modal } from '@/components/ui/Modal';
import { WeekView } from '@/components/schedule/WeekView';
import { MonthView } from '@/components/schedule/MonthView';
import { SessionPopover } from '@/components/schedule/SessionPopover';
import { PlanUpdatesDrawer } from '@/components/schedule/PlanUpdatesDrawer';
import { DemoFab } from '@/components/schedule/DemoFab';
import { planReadiness } from '@/components/schedule/PlanSetupGuide';
import { useRecentHighlight } from '@/components/schedule/useHighlight';
import { SessionRow } from '@/components/sessions/SessionRow';
import { SubjectDot } from '@/components/ui/Feedback';
import { addDays, formatFullDate, formatMonthDay, formatMonthYear, nowMinutes, rangeDays, relativeDay, startOfWeek, timeToMin } from '@/lib/date';
import { cn, plural } from '@/lib/utils';

type View = 'day' | 'week' | 'month';

export default function StudyPlan() {
  const d = useDerived();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('day');
  const [anchor, setAnchor] = useState<ISODate | null>(null);
  const [pop, setPop] = useState<{ session: StudySession; rect: DOMRect } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState<null | { ai: boolean }>(null);
  const [params, setParams] = useSearchParams();
  const hot = useRecentHighlight();
  const generate = useDataStore((s) => s.generatePlan);
  const move = useDataStore((s) => s.moveSession);
  const pending = useDataStore((s) => s.pending);
  const lastSeen = useUIStore((s) => s.lastSeenLogId);
  const markSeen = useUIStore((s) => s.markLogsSeen);

  const openDrawer = useCallback(() => setDrawer(true), []);
  // "See plan updates" from a toast (on this page) or ?changes=1 (from another page).
  useEffect(() => {
    window.addEventListener('orbit:open-updates', openDrawer);
    return () => window.removeEventListener('orbit:open-updates', openDrawer);
  }, [openDrawer]);
  useEffect(() => {
    if (params.get('changes') !== '1') return;
    setDrawer(true);
    setParams({}, { replace: true });
  }, [params, setParams]);
  // Opening the drawer marks everything as seen.
  useEffect(() => {
    if (drawer && d?.snapshot.changeLog[0]) markSeen(d.snapshot.changeLog[0].id);
  }, [drawer, d?.snapshot.changeLog, markSeen]);

  if (!d) return <PageSkeleton variant="calendar" />;
  const base = anchor ?? d.today;
  const { blocker } = planReadiness(d);
  const futurePlanned = d.snapshot.sessions.filter((s) => s.status === 'planned' && s.date >= d.today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const hasPlan = futurePlanned.length > 0;
  const log = d.snapshot.changeLog;
  const seenIdx = lastSeen ? log.findIndex((l) => l.id === lastSeen) : -1;
  const unseen = seenIdx === -1 ? log.length : seenIdx;

  /** Generate — or explain exactly what is missing instead of producing an empty calendar. */
  const runGenerate = (ai = false) => {
    if (blocker) {
      toast({ tone: 'warning', title: "Orbit can't build a plan yet", description: blocker.detail, action: { label: blocker.action.label, onClick: () => navigate(blocker.action.to) } });
      return;
    }
    if (hasPlan) setConfirmRegen({ ai });
    else void generate({ ai });
  };

  const onMove = (id: string, to: SlotRef) => {
    if (to.date < d.today || (to.date === d.today && timeToMin(to.start) < nowMinutes())) {
      toast({ tone: 'danger', title: "Can't move into the past", description: 'Drop the session on a future time.' });
      return;
    }
    const s = d.snapshot.sessions.find((x) => x.id === id);
    if (!s || (s.date === to.date && s.start === to.start)) return;
    void move(id, to);
  };
  const onOpen = (session: StudySession, rect: DOMRect) => setPop({ session, rect });

  const step = (dir: 1 | -1) => {
    if (view === 'day') setAnchor(addDays(base, dir));
    else if (view === 'week') setAnchor(addDays(base, 7 * dir));
    else {
      const [y, m] = base.split('-').map(Number);
      const nd = new Date(y, m - 1 + dir, 1);
      setAnchor(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-01`);
    }
  };

  const weekDays = rangeDays(startOfWeek(base), 7);
  const visibleDays = view === 'day' ? [base] : view === 'week' ? weekDays : [];
  const visibleCount = d.snapshot.sessions.filter((s) => visibleDays.includes(s.date)).length;
  const nextOutside = futurePlanned.find((s) => !visibleDays.includes(s.date));
  const rangeLabel = view === 'day' ? formatFullDate(base) : view === 'week' ? `${formatMonthDay(weekDays[0])} – ${formatMonthDay(weekDays[6])}` : formatMonthYear(base);
  const daySessions = d.snapshot.sessions.filter((s) => s.date === base).sort((a, b) => a.start.localeCompare(b.start));
  const isCurrent = view === 'month' ? base.slice(0, 7) === d.today.slice(0, 7) : visibleDays.includes(d.today);
  const planDays = new Set(futurePlanned.map((s) => s.date)).size;

  return (
    <>
      <PageHeader
        title="Study Plan"
        subtitle="Your living schedule"
        description={hasPlan ? `${plural(futurePlanned.length, 'session')} planned across ${plural(planDays, 'day')}. Click a session to start, finish, skip or reschedule it.` : 'Your sessions, placed by priority inside your study hours. It re-plans when things change.'}
        actions={
          <>
            <Button variant="secondary" icon={<History className="h-4 w-4" />} onClick={() => setDrawer(true)} title="See every change Orbit made to your plan, and why">
              Plan updates{unseen > 0 ? ` (${Math.min(unseen, 9)}${unseen > 9 ? '+' : ''})` : ''}
            </Button>
            <Button variant="ghost" icon={<BrainCircuit className="h-4 w-4" />} loading={pending.generate} onClick={() => runGenerate(true)} title="AI planning (beta) — currently uses the same rules as Generate plan">
              AI plan
            </Button>
            <Button size="lg" icon={<Sparkles className="h-4 w-4" />} loading={pending.generate} onClick={() => runGenerate(false)}>
              {hasPlan ? 'Regenerate plan' : 'Generate plan'}
            </Button>
          </>
        }
      />

      {/* No plan: say why, and how to fix it */}
      {!hasPlan && (
        <div className={cn('mb-8 rounded-2xl border p-6', blocker ? 'border-amber/35 bg-amber/[0.06]' : 'border-violet/30 bg-violet/[0.06]')} role="status">
          <p className="text-sm font-semibold text-ink">{blocker ? "Your plan can't be built yet" : 'Ready to plan'}</p>
          <p className="mt-1 text-sm text-muted">{blocker ? blocker.detail : 'Press Generate plan and Orbit fills your study hours, most urgent topics first.'}</p>
          {blocker && (
            <Link to={blocker.action.to} className="mt-3 inline-flex">
              <Button variant="secondary" size="sm">
                {blocker.action.label}
              </Button>
            </Link>
          )}
        </div>
      )}

      <LayoutGroup id="schedule">
        <GlassCard padded={false} hover={false} className="p-4 sm:p-6">
          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <IconButton label={`Previous ${view}`} size="sm" onClick={() => step(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <IconButton label={`Next ${view}`} size="sm" onClick={() => step(1)}>
                <ChevronRight className="h-4 w-4" />
              </IconButton>
              <h2 className="ml-2 font-display text-base font-semibold text-ink" aria-live="polite">
                {rangeLabel}
              </h2>
              {!isCurrent && (
                <Button size="sm" variant="ghost" className="ml-1" onClick={() => setAnchor(null)}>
                  Back to today
                </Button>
              )}
            </div>
            <Segmented
              label="Calendar view"
              value={view}
              onChange={setView}
              options={[
                { value: 'day', label: 'Day', icon: <ListOrdered className="h-3.5 w-3.5" /> },
                { value: 'week', label: 'Week', icon: <CalendarRange className="h-3.5 w-3.5" /> },
                { value: 'month', label: 'Month', icon: <CalendarDays className="h-3.5 w-3.5" /> },
              ]}
            />
          </div>

          {/* Legend */}
          <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
            {d.snapshot.subjects.map((s) => (
              <span key={s.id} className="flex items-center gap-1.5">
                <SubjectDot color={s.color} /> {s.name}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded border border-dashed border-violet/40 bg-violet/10" /> your study hours
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-amber" /> now
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-4 rounded border border-amber" /> after deadline
              <InfoTip>Orbit could not fit this session before its exam or due date. Add study hours or trim the topic.</InfoTip>
            </span>
            {view !== 'month' && <span className="ml-auto hidden text-faint md:inline">Click a session for options · drag it to a new time</span>}
          </div>

          <div className="relative">
            <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              {view === 'day' && (
                <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                  <div>
                    <p className="mb-3 text-sm font-semibold text-ink">{relativeDay(base)}</p>
                    {daySessions.length === 0 ? (
                      <EmptyState
                        compact
                        art="planet"
                        title="Nothing planned on this day"
                        description={nextOutside ? `Your next session is ${relativeDay(nextOutside.date).toLowerCase()}.` : hasPlan ? 'Use the arrows to browse other days.' : 'Generate a plan to fill your days.'}
                        action={
                          nextOutside ? (
                            <Button size="sm" variant="secondary" onClick={() => setAnchor(nextOutside.date)}>
                              Go to {relativeDay(nextOutside.date)}
                            </Button>
                          ) : undefined
                        }
                      />
                    ) : (
                      <ul className="space-y-3">
                        {daySessions.map((s) => (
                          <SessionRow key={s.id} s={s} d={d} compact />
                        ))}
                      </ul>
                    )}
                  </div>
                  <WeekView d={d} days={[base]} hot={hot} focusId={focusId} onOpen={onOpen} onMove={onMove} />
                </div>
              )}
              {view === 'week' && <WeekView d={d} days={weekDays} hot={hot} focusId={focusId} onOpen={onOpen} onMove={onMove} />}
              {view === 'month' && (
                <MonthView
                  d={d}
                  anchor={base}
                  hot={hot}
                  onMove={onMove}
                  onOpen={onOpen}
                  onPickDay={(day) => {
                    setAnchor(day);
                    setView('day');
                  }}
                />
              )}
            </motion.div>

            {view === 'week' && visibleCount === 0 && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
                <div className="glass-strong pointer-events-auto max-w-sm p-6 text-center">
                  <p className="font-display text-base font-semibold text-ink">{hasPlan ? 'Nothing scheduled this week' : 'Your calendar is empty'}</p>
                  <p className="mt-1 text-sm text-muted">{hasPlan ? 'Your sessions are in other weeks.' : blocker ? blocker.detail : 'Press Generate plan at the top of the page.'}</p>
                  {hasPlan && nextOutside && (
                    <Button size="sm" variant="secondary" className="mt-4" onClick={() => setAnchor(nextOutside.date)}>
                      Jump to next session ({relativeDay(nextOutside.date)})
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </GlassCard>
      </LayoutGroup>

      <SessionPopover d={d} session={pop ? (d.snapshot.sessions.find((s) => s.id === pop.session.id) ?? null) : null} anchor={pop?.rect ?? null} onClose={() => setPop(null)} />
      <PlanUpdatesDrawer d={d} open={drawer} onClose={() => setDrawer(false)} onHover={setFocusId} />
      <DemoFab />

      <Modal
        open={!!confirmRegen}
        onClose={() => setConfirmRegen(null)}
        title="Rebuild your plan?"
        description="Orbit re-places every upcoming auto-scheduled session from scratch."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRegen(null)}>
              Keep current plan
            </Button>
            <Button
              icon={<Sparkles className="h-4 w-4" />}
              onClick={() => {
                const ai = confirmRegen?.ai;
                setConfirmRegen(null);
                void generate({ ai });
              }}
            >
              Rebuild plan
            </Button>
          </>
        }
      >
        <ul className="space-y-2 text-sm text-muted">
          <li>✓ Finished and skipped sessions stay in your history</li>
          <li>✓ Sessions you moved yourself stay where you put them</li>
          <li>↻ Everything else is re-planned around your current topics and hours</li>
        </ul>
      </Modal>
    </>
  );
}
