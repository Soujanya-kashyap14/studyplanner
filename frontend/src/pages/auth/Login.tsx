import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, Sparkles } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { Field, Input } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/useAuthStore';
import { validateEmail } from './validation';
const DEMO_EMAIL = 'demo@orbit.app';
const DEMO_PASSWORD = 'orbit123';
import { USE_MOCK } from '@/config/api';

export default function Login() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);

  async function submit(e?: FormEvent, creds?: { email: string; password: string }) {
    e?.preventDefault();
    const em = creds?.email ?? email;
    const pw = creds?.password ?? password;
    const next = { email: validateEmail(em), password: pw ? undefined : 'Password is required.' };
    setErrors(next);
    if (next.email || next.password) return;
    setLoading(true);
    try {
      await login(em, pw);
      navigate(from, { replace: true });
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Login failed.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Pick up your orbit where you left it.">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <AnimatePresence>
          {errors.form && (
            <motion.p role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="rounded-xl border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">
              {errors.form}
            </motion.p>
          )}
        </AnimatePresence>
        <Field label="Email" error={errors.email}>
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" />
        </Field>
        <Field label="Password" error={errors.password}>
          <div className="relative">
            <Input type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pr-11" />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-faint hover:text-ink">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Button type="submit" size="lg" loading={loading} iconRight={!loading && <ArrowRight className="h-4 w-4" />} className="mt-2 w-full">
          Log in
        </Button>
        {(USE_MOCK || import.meta.env.VITE_DEMO_LOGIN !== 'false') && (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            icon={<Sparkles className="h-4 w-4 text-amber" />}
            className="w-full"
            disabled={loading}
            onClick={() => {
              setEmail(DEMO_EMAIL);
              setPassword(DEMO_PASSWORD);
              void submit(undefined, { email: DEMO_EMAIL, password: DEMO_PASSWORD });
            }}
          >
            Explore the demo account
          </Button>
        )}
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        New to Orbit?{' '}
        <Link to="/register" className="font-semibold text-cyan underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
