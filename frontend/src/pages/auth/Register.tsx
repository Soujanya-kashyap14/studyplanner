import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { Field, Input } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/useAuthStore';
import { validateEmail, validateName, validatePassword } from './validation';
import { cn } from '@/lib/utils';

/** Simple password strength meter (0..4). */
function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/\d/.test(pw) && /[A-Za-z]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

export default function Register() {
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form | 'form', string>>>({});
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const s = strength(form.password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = {
      name: validateName(form.name),
      email: validateEmail(form.email),
      password: validatePassword(form.password),
      confirm: form.confirm !== form.password ? 'Passwords don’t match.' : undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      navigate('/setup', { replace: true });
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Could not create account.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Create your universe" subtitle="We'll seed it with a sample sky so you can explore right away.">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <AnimatePresence>
          {errors.form && (
            <motion.p role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="rounded-xl border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">
              {errors.form}
            </motion.p>
          )}
        </AnimatePresence>
        <Field label="Name" error={errors.name}>
          <Input autoComplete="name" value={form.name} onChange={set('name')} placeholder="Maya Chen" />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" autoComplete="email" value={form.email} onChange={set('email')} placeholder="you@school.edu" />
        </Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters with letters and a number.">
          <Input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
        <div className="-mt-2 flex gap-1" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors duration-300', i < s ? (s <= 1 ? 'bg-rose' : s === 2 ? 'bg-amber' : 'bg-mint') : 'bg-line/10')} />
          ))}
        </div>
        <Field label="Confirm password" error={errors.confirm}>
          <Input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
        </Field>
        <Button type="submit" size="lg" loading={loading} iconRight={!loading && <ArrowRight className="h-4 w-4" />} className="mt-2 w-full">
          Launch my Orbit
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-cyan underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
