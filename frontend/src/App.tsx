import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { Starfield } from '@/components/background/Starfield';
import { Toaster } from '@/components/ui/Toaster';
import { AppShell } from '@/components/layout/AppShell';
import { LaunchScreen, ProtectedRoute, PublicOnlyRoute } from '@/components/layout/ProtectedRoute';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { useAuthStore } from '@/store/useAuthStore';
import { useUIStore } from '@/store/useUIStore';
import { useDataStore } from '@/store/useDataStore';

// Route-level code splitting keeps the first paint light.
const Login = lazy(() => import('@/pages/auth/Login'));
const Register = lazy(() => import('@/pages/auth/Register'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Subjects = lazy(() => import('@/pages/Subjects'));
const Exams = lazy(() => import('@/pages/Exams'));
const Availability = lazy(() => import('@/pages/Availability'));
const StudyPlan = lazy(() => import('@/pages/StudyPlan'));
const Analytics = lazy(() => import('@/pages/Analytics'));
const Achievements = lazy(() => import('@/pages/Achievements'));
const Settings = lazy(() => import('@/pages/Settings'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const Setup = lazy(() => import('@/pages/Setup'));

export default function App() {
  const init = useAuthStore((s) => s.init);
  const reducedMotion = useUIStore((s) => s.reducedMotion);

  useEffect(() => {
    void init();
  }, [init]);

  // The server rejected our token (expired / revoked): sign out locally; routes redirect to /login.
  useEffect(() => {
    const onUnauthorized = () => {
      useAuthStore.setState({ user: null, status: 'anon' });
      useDataStore.getState().clear();
    };
    window.addEventListener('orbit:unauthorized', onUnauthorized);
    return () => window.removeEventListener('orbit:unauthorized', onUnauthorized);
  }, []);

  const page = (el: JSX.Element) => <Suspense fallback={<PageSkeleton />}>{el}</Suspense>;

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
      <Starfield />
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <Suspense fallback={<LaunchScreen />}>
                <Login />
              </Suspense>
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <Suspense fallback={<LaunchScreen />}>
                <Register />
              </Suspense>
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/setup"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LaunchScreen />}>
                <Setup />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={page(<Dashboard />)} />
          <Route path="plan" element={page(<StudyPlan />)} />
          <Route path="subjects" element={page(<Subjects />)} />
          <Route path="exams" element={page(<Exams />)} />
          <Route path="availability" element={page(<Availability />)} />
          <Route path="analytics" element={page(<Analytics />)} />
          <Route path="achievements" element={page(<Achievements />)} />
          <Route path="settings" element={page(<Settings />)} />
          <Route path="*" element={page(<NotFound />)} />
        </Route>
      </Routes>
      <Toaster />
    </MotionConfig>
  );
}
