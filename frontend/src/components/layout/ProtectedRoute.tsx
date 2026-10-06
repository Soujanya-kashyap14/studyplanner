import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { LogoMark } from './Logo';

/** Full-screen launch loader shown while the session is verified. */
export function LaunchScreen({ label = 'Aligning your orbit…' }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="h-16 w-16" />
        <p className="eyebrow">{label}</p>
      </div>
    </div>
  );
}

/** Redirects to /login when there is no valid session; remembers where the user was going. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  if (status === 'checking') return <LaunchScreen />;
  if (status === 'anon') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/** Keeps signed-in users away from /login and /register. */
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'checking') return <LaunchScreen />;
  if (status === 'authed') return <Navigate to="/" replace />;
  return <>{children}</>;
}
