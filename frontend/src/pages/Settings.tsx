import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Eraser, Moon, RotateCcw, Save, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { setSetupSkipped } from '@/lib/setupFlags';
import { useAuthStore } from '@/store/useAuthStore';
import { useUIStore, toast } from '@/store/useUIStore';
import { useDataStore } from '@/store/useDataStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Field, Input, Segmented, Toggle } from '@/components/ui/Form';
import { ConfirmDialog } from '@/components/ui/Modal';
import { DemoControls } from '@/components/schedule/DemoControls';
import { validateEmail, validateName } from './auth/validation';
import { cn } from '@/lib/utils';

const LENGTHS = [25, 45, 50, 60, 90];

export default function Settings() {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const ui = useUIStore();
  const resetDemo = useDataStore((s) => s.resetDemo);
  const [form, setForm] = useState({ name: '', email: '', session: 50, brk: 10 });
  const [errors, setErrors] = useState<{ name?: string; email?: string; brk?: string }>({});
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const clearData = useDataStore((s) => s.clearData);
  const navigate = useNavigate();

  // Avatar menu → "Demo tools" links to /settings#demo.
  useEffect(() => {
    if (window.location.hash === '#demo') window.setTimeout(() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' }), 300);
  }, []);

  useEffect(() => {
    if (user) setForm({ name: user.name, email: user.email, session: user.preferredSessionMinutes, brk: user.breakMinutes });
  }, [user]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const next = {
      name: validateName(form.name),
      email: validateEmail(form.email),
      brk: form.brk < 0 || form.brk > 30 ? 'Between 0 and 30 minutes.' : undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    try {
      await updateProfile({ name: form.name.trim(), email: form.email.trim(), preferredSessionMinutes: form.session, breakMinutes: form.brk });
      toast({ tone: 'success', title: 'Profile saved', description: 'New session lengths apply the next time you generate a plan.' });
    } catch (err) {
      toast({ tone: 'danger', title: 'Could not save', description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Mission control"
        description="Your profile, session length, theme, demo tools and data."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard title="Profile & study rhythm" eyebrow="You">
          <form onSubmit={save} className="flex flex-col gap-4" noValidate>
            <Field label="Name" error={errors.name}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
            </Field>
            <Field label="Email" error={errors.email}>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
            </Field>
            <div>
              <p className="mb-2 text-xs font-medium text-muted" id="len-label">
                Preferred session length
              </p>
              <div role="radiogroup" aria-labelledby="len-label" className="flex flex-wrap gap-2">
                {LENGTHS.map((m) => (
                  <motion.button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={form.session === m}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setForm({ ...form, session: m })}
                    className={cn('h-10 min-w-[64px] rounded-xl border px-3 font-mono text-sm transition-colors', form.session === m ? 'border-violet/60 bg-violet/15 text-ink shadow-glow' : 'border-line/15 text-muted hover:text-ink')}
                  >
                    {m}m
                  </motion.button>
                ))}
              </div>
            </div>
            <Field label="Break between sessions (minutes)" error={errors.brk}>
              <Input type="number" min={0} max={30} value={form.brk} onChange={(e) => setForm({ ...form, brk: Number(e.target.value) })} />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" icon={<Save className="h-4 w-4" />} loading={saving}>
                Save profile
              </Button>
            </div>
          </form>
        </GlassCard>

        <div className="flex flex-col gap-4">
          <GlassCard title="Appearance & motion" eyebrow="Interface">
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-ink">Theme</p>
                  <p className="text-xs text-muted">Midnight for night owls, Dawn for early risers.</p>
                </div>
                <Segmented
                  label="Theme"
                  value={ui.theme}
                  onChange={ui.setTheme}
                  options={[
                    { value: 'midnight', label: 'Midnight', icon: <Moon className="h-3.5 w-3.5" /> },
                    { value: 'dawn', label: 'Dawn', icon: <Sun className="h-3.5 w-3.5" /> },
                  ]}
                />
              </div>
              <div className="grid grid-cols-2 gap-3" aria-hidden>
                {(['midnight', 'dawn'] as const).map((t) => (
                  <button
                    key={t}
                    tabIndex={-1}
                    onClick={() => ui.setTheme(t)}
                    data-theme={t}
                    className={cn('overflow-hidden rounded-2xl border-2 p-3 text-left transition-colors', ui.theme === t ? 'border-violet' : 'border-line/10')}
                    style={{ background: 'linear-gradient(160deg, rgb(var(--bg-0)), rgb(var(--bg-1)))' }}
                  >
                    <div className="sky-panel mb-2 h-12 rounded-xl" />
                    <div className="flex gap-1.5">
                      {['violet', 'cyan', 'amber', 'mint'].map((c) => (
                        <span key={c} className="h-3 w-3 rounded-full" style={{ background: `rgb(var(--${c}))` }} />
                      ))}
                    </div>
                    <p className="mt-2 text-xs font-semibold capitalize text-ink">{t}</p>
                  </button>
                ))}
              </div>
              <Toggle checked={ui.reducedMotion} onChange={ui.setReducedMotion} label="Reduce motion" description="Turns off parallax, twinkling and reflow animations. Your OS setting is always respected too." />
            </div>
          </GlassCard>

          <GlassCard id="demo" title="Demo tools" eyebrow="Show the plan adapting" className="scroll-mt-[96px]">
            <div className="flex flex-col gap-4">
              <Toggle checked={ui.demoMode} onChange={ui.setDemoMode} label="Show demo controls" description="Adds time-travel buttons to the Study Plan so you can trigger the Living Schedule reflow on demand." />
              <DemoControls />
            </div>
          </GlassCard>

          <GlassCard title="Your data" eyebrow="Start over">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-line/10 bg-line/[0.03] p-4">
                <div>
                  <p className="text-sm font-medium text-ink">Start fresh with guided setup</p>
                  <p className="text-xs text-muted">Clears your subjects, topics, exams and plan, then walks you through setup step by step.</p>
                </div>
                <Button variant="danger" size="sm" icon={<Eraser className="h-3.5 w-3.5" />} onClick={() => setConfirmClear(true)}>
                  Start fresh
                </Button>
              </div>
              {(
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-line/10 bg-line/[0.03] p-4">
                  <div>
                    <p className="text-sm font-medium text-ink">Load sample data</p>
                    <p className="text-xs text-muted">Replaces your data with a ready-made example (3 subjects, exams, history) to explore every feature.</p>
                  </div>
                  <Button variant="secondary" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setConfirmReset(true)}>
                    Load
                  </Button>
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Load sample data?"
        description="Everything in this account is replaced by the sample universe."
        confirmLabel="Replace with sample"
        onConfirm={() => void resetDemo()}
      />
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Start fresh?"
        description="All subjects, topics, exams, sessions and history in this account are deleted. You'll go straight to guided setup."
        confirmLabel="Delete and start setup"
        onConfirm={async () => {
          if (await clearData()) {
            setSetupSkipped(user?.id, false);
            navigate('/setup');
          }
        }}
      />
    </>
  );
}
