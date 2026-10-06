import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Activity, CheckCircle2, Clock, Table2, TrendingUp, XCircle, BarChart3 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useDerived, type Derived } from '@/hooks/useDerived';
import { useThemeColors } from '@/hooks/useThemeColors';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedNumber, SubjectDot } from '@/components/ui/Feedback';
import { Segmented } from '@/components/ui/Form';
import { SmartSuggestions } from '@/components/suggestions/SmartSuggestions';
import { PeakHoursCard } from '@/components/insights/PeakHoursCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Link } from 'react-router-dom';
import { addDays, formatMonthDay, formatWeekday, startOfWeek } from '@/lib/date';
import { chartColor, cn, round1, sum } from '@/lib/utils';
import { completionRate, projectProgress, topicsProgress } from '@/utils/scheduler';

type Colors = ReturnType<typeof useThemeColors>;

/** Card wrapper with an accessible "view as table" alternative for every chart. */
/** Chart card: plain title, a visible one-sentence takeaway, the chart, and a "Table" alternative. */
function ChartCard({ title, summary, table, children, className, action, empty }: { title: string; summary: string; table: { head: string[]; rows: (string | number)[][] }; children: ReactNode; className?: string; action?: ReactNode; empty?: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <GlassCard
      title={title}
      className={className}
      hover={false}
      action={
        <div className="flex items-center gap-2">
          {action}
          <button onClick={() => setAsTable((t) => !t)} aria-pressed={asTable} className={cn('flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors', asTable ? 'bg-violet/15 text-violet' : 'text-muted hover:bg-line/[0.06] hover:text-ink')}>
            {asTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
            {asTable ? 'Chart' : 'Table'}
          </button>
        </div>
      }
    >
      <p className="-mt-2 mb-5 text-sm text-muted">{summary}</p>
      {empty ? (
        empty
      ) : (
      <>
      {asTable ? (
        <div className="overflow-x-auto rounded-xl border border-line/10">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[rgb(var(--bg-1))]">
              <tr>
                {table.head.map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-wider text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-line/10">
                  {r.map((c, j) => (
                    <td key={j} className={cn('px-3 py-2', j === 0 ? 'text-ink' : 'font-mono text-muted')}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div aria-hidden>{children}</div>
      )}
      </>
      )}
    </GlassCard>
  );
}

function ChartTooltip({ active, payload, label, unit = 'h' }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-strong rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}
          <span className="ml-auto pl-3 font-mono text-ink">
            {p.value}
            {unit}
          </span>
        </p>
      ))}
    </div>
  );
}

const axis = (c: Colors) => ({ tick: { fill: c.muted, fontSize: 11, fontFamily: 'JetBrains Mono' }, axisLine: false, tickLine: false });

export default function Analytics() {
  const d = useDerived();
  const c = useThemeColors();
  if (!d) return <PageSkeleton variant="charts" />;
  if (d.snapshot.topics.length === 0) {
    return (
      <>
        <PageHeader title="Progress" subtitle="Telemetry" description="How much you have covered, how much you study, and where your pace is heading." />
        <div className="glass">
          <EmptyState art="telescope" title="Nothing to measure yet" description="Add subjects and topics, generate a plan and finish a session — your progress charts appear here." action={<Link to="/subjects?new=1"><Button>Add your first subject</Button></Link>} />
        </div>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="Progress"
        subtitle="Telemetry"
        description="How much you have covered, how much you study, and where your pace is heading."
      />
      <StatTiles d={d} />
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <SubjectProgressChart d={d} c={c} />
        <HoursChart d={d} c={c} />
        <PlannedVsActualChart d={d} c={c} />
        <PredictionChart d={d} c={c} />
      </div>
      <div className="mt-4">
        <PeakHoursCard d={d} />
      </div>
      <div className="mt-4">
        <SmartSuggestions d={d} />
      </div>
    </>
  );
}

function StatTiles({ d }: { d: Derived }) {
  const done = d.snapshot.sessions.filter((s) => s.status === 'completed');
  const totalHours = sum(done.map((s) => s.actualMin ?? s.durationMin)) / 60;
  const rate = completionRate(d.snapshot.sessions);
  const since = addDays(d.today, -14);
  const missed = d.snapshot.sessions.filter((s) => s.status === 'missed' && s.date >= since).length;
  const tiles = [
    { label: 'Completion rate', value: Math.round(rate * 100), suffix: '%', icon: <CheckCircle2 className="h-4 w-4 text-mint" />, note: 'completed ÷ (completed + missed)' },
    { label: 'Hours focused', value: round1(totalHours), suffix: 'h', decimals: 1, icon: <Clock className="h-4 w-4 text-cyan" />, note: 'all time' },
    { label: 'Daily average', value: round1(d.week.hours / 7), suffix: 'h', decimals: 1, icon: <Activity className="h-4 w-4 text-violet" />, note: 'last 7 days' },
    { label: 'Missed sessions', value: missed, suffix: '', icon: <XCircle className="h-4 w-4 text-rose" />, note: 'last 14 days' },
  ];
  return (
    <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
      {tiles.map((t, i) => (
        <motion.div key={t.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }} className="glass p-4 sm:p-5">
          <p className="flex items-center gap-2 text-xs font-medium text-muted">
            {t.icon}
            {t.label}
          </p>
          <p className="mt-2 font-mono text-3xl font-bold text-ink">
            <AnimatedNumber value={t.value} decimals={t.decimals ?? 0} />
            <span className="text-base text-muted">{t.suffix}</span>
          </p>
          <p className="mt-1 text-[11px] text-faint">{t.note}</p>
        </motion.div>
      ))}
    </div>
  );
}

function SubjectProgressChart({ d, c }: { d: Derived; c: Colors }) {
  const data = d.snapshot.subjects.map((s) => ({
    name: s.name,
    progress: Math.round(topicsProgress(d.topicsBySubject.get(s.id) ?? []) * 100),
    color: chartColor(s.color, c.theme),
    raw: s.color,
  }));
  return (
    <ChartCard
      title="How much of each subject is done"
      summary={(() => {
        const sorted = [...data].sort((a, b) => b.progress - a.progress);
        if (sorted.length < 2) return `${sorted[0]?.name ?? 'Your subject'} is ${sorted[0]?.progress ?? 0}% done.`;
        return `${sorted[0].name} is furthest along (${sorted[0].progress}%); ${sorted[sorted.length - 1].name} needs the most work (${sorted[sorted.length - 1].progress}%).`;
      })()}
      table={{ head: ['Subject', 'Progress'], rows: data.map((x) => [x.name, `${x.progress}%`]) }}
    >
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 64)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }} barCategoryGap={18}>
          <CartesianGrid horizontal={false} stroke={c.grid} />
          <XAxis type="number" domain={[0, 100]} {...axis(c)} tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="name" width={118} {...axis(c)} tick={{ fill: c.ink, fontSize: 12 }} />
          <Tooltip cursor={{ fill: c.grid }} content={<ChartTooltip unit="%" />} />
          <Bar dataKey="progress" name="Progress" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((x) => (
              <Cell key={x.name} fill={x.color} />
            ))}
            <LabelList dataKey="progress" position="right" formatter={(v: number) => `${v}%`} style={{ fill: c.ink, fontSize: 12, fontFamily: 'JetBrains Mono' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function HoursChart({ d, c }: { d: Derived; c: Colors }) {
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const data = useMemo(() => {
    const done = d.snapshot.sessions.filter((s) => s.status === 'completed');
    if (mode === 'day') {
      return Array.from({ length: 14 }, (_, i) => {
        const day = addDays(d.today, i - 13);
        return { label: `${formatWeekday(day).slice(0, 2)} ${formatMonthDay(day).replace(/\D+/g, '')}`, hours: round1(sum(done.filter((s) => s.date === day).map((s) => s.actualMin ?? s.durationMin)) / 60) };
      });
    }
    const thisWeek = startOfWeek(d.today);
    return Array.from({ length: 6 }, (_, i) => {
      const ws = addDays(thisWeek, (i - 5) * 7);
      const we = addDays(ws, 6);
      return { label: formatMonthDay(ws), hours: round1(sum(done.filter((s) => s.date >= ws && s.date <= we).map((s) => s.actualMin ?? s.durationMin)) / 60) };
    });
  }, [d, mode]);
  return (
    <ChartCard
      title="Hours you studied"
      summary={(() => {
        const total = round1(sum(data.map((x) => x.hours)));
        const best = [...data].sort((a, b) => b.hours - a.hours)[0];
        return total ? `${total}h in the ${mode === 'day' ? 'last 14 days' : 'last 6 weeks'} — your best ${mode === 'day' ? 'day' : 'week'} was ${best.label} with ${best.hours}h.` : 'No finished sessions in this period yet.';
      })()}
      empty={sum(data.map((x) => x.hours)) === 0 ? <EmptyState compact art="calendar" title="No study time logged yet" description="Finish a session (press Done) and your hours show up here." /> : undefined}
      table={{ head: [mode === 'day' ? 'Day' : 'Week of', 'Hours'], rows: data.map((x) => [x.label, x.hours]) }}
      action={<Segmented label="Group hours by" value={mode} onChange={setMode} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]} />}
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ left: -16, right: 8, top: 16 }}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey="label" {...axis(c)} interval={mode === 'day' ? 1 : 0} />
          <YAxis {...axis(c)} allowDecimals={false} />
          <Tooltip cursor={{ fill: c.grid }} content={<ChartTooltip />} />
          <Bar dataKey="hours" name="Studied" fill={c.violet} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function PlannedVsActualChart({ d, c }: { d: Derived; c: Colors }) {
  const data = Array.from({ length: 10 }, (_, i) => {
    const day = addDays(d.today, i - 9);
    const sessions = d.snapshot.sessions.filter((s) => s.date === day);
    return {
      label: `${formatWeekday(day).slice(0, 2)} ${formatMonthDay(day).replace(/\D+/g, '')}`,
      planned: round1(sum(sessions.map((s) => s.durationMin)) / 60),
      actual: round1(sum(sessions.filter((s) => s.status === 'completed').map((s) => s.actualMin ?? s.durationMin)) / 60),
    };
  });
  const tp = round1(sum(data.map((x) => x.planned)));
  const ta = round1(sum(data.map((x) => x.actual)));
  return (
    <ChartCard
      title="Planned vs. actually studied"
      summary={tp ? `You studied ${Math.round((ta / tp) * 100)}% of the time you planned over the last 10 days (${ta}h of ${tp}h).` : 'Nothing was planned in the last 10 days.'}
      empty={tp === 0 ? <EmptyState compact art="calendar" title="No past plan to compare yet" description="Once planned days go by, you'll see how much of the plan you actually did." /> : undefined}
      table={{ head: ['Day', 'Planned (h)', 'Actual (h)'], rows: data.map((x) => [x.label, x.planned, x.actual]) }}
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ left: -16, right: 8, top: 16 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey="label" {...axis(c)} interval={1} />
          <YAxis {...axis(c)} allowDecimals={false} />
          <Tooltip cursor={{ fill: c.grid }} content={<ChartTooltip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: c.muted }} />
          <Bar dataKey="planned" name="Planned" fill={c.faint} fillOpacity={0.45} radius={[4, 4, 0, 0]} maxBarSize={16} />
          <Bar dataKey="actual" name="Actual" fill={c.cyan} radius={[4, 4, 0, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function PredictionChart({ d, c }: { d: Derived; c: Colors }) {
  const proj = useMemo(() => projectProgress(d.input), [d]);
  const data = proj.points.map((p) => ({ ...p, label: formatMonthDay(p.date) }));
  const last = data[data.length - 1];
  const endLabel = (key: 'plan' | 'pace', color: string) =>
    function EndLabel(props: { x?: number; y?: number; index?: number; value?: number }) {
      if (props.index !== data.length - 1 || props.value == null) return <g />;
      return (
        <text x={(props.x ?? 0) + 6} y={(props.y ?? 0) + 4} fill={color} fontSize={11} fontFamily="JetBrains Mono">
          {props.value}%
          <tspan fill={c.muted}> {key}</tspan>
        </text>
      );
    };
  return (
    <ChartCard
      title="Where your progress is heading"
      summary={`You're at ${data[14]?.actual}% today. Following the plan gets you to ${last.planned}% in two weeks; at your recent pace (${proj.avgDailyHours}h a day) you'd reach ${last.predicted}%.`}
      table={{ head: ['Date', 'Actual %', 'Planned %', 'Predicted %'], rows: data.map((x) => [x.label, x.actual ?? '—', x.planned ?? '—', x.predicted ?? '—']) }}
    >
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ left: -16, right: 96, top: 16 }}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey="label" {...axis(c)} interval={3} />
          <YAxis {...axis(c)} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
          <Tooltip content={<ChartTooltip unit="%" />} cursor={{ stroke: c.faint, strokeDasharray: '3 3' }} />
          <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 12, color: c.muted }} />
          <Line type="monotone" dataKey="actual" name="Actual" stroke={c.violet} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} connectNulls={false} />
          <Line type="monotone" dataKey="planned" name="If plan followed" stroke={c.cyan} strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} label={endLabel('plan', c.cyan)} />
          <Line type="monotone" dataKey="predicted" name="At recent pace" stroke={c.muted} strokeWidth={2} strokeDasharray="2 4" dot={false} activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} label={endLabel('pace', c.muted)} />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        <TrendingUp className="h-3.5 w-3.5 text-cyan" aria-hidden />
        Recent pace {proj.avgDailyHours}h/day at {Math.round(proj.completionRate * 100)}% completion.
        {last.predicted != null && last.planned != null && last.predicted < last.planned - 5 && <span className="text-amber"> You&apos;re trailing the plan — a couple of extra sessions closes it.</span>}
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
        {d.snapshot.subjects.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5">
            <SubjectDot color={s.color} glow={false} /> {s.name}: {Math.round(topicsProgress(d.topicsBySubject.get(s.id) ?? []) * 100)}%
          </span>
        ))}
      </div>
    </ChartCard>
  );
}
