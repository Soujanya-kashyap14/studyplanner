import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Logo } from '@/components/layout/Logo';
import { seeded } from '@/lib/utils';

/** A small decorative constellation that "lights up" star by star. */
function HeroSky() {
  const rand = seeded(7);
  const stars = [
    [60, 220],
    [120, 160],
    [190, 190],
    [240, 110],
    [320, 140],
    [380, 70],
    [300, 250],
    [210, 290],
  ];
  const links = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [2, 7],
    [7, 6],
    [6, 4],
  ];
  const dust = Array.from({ length: 70 }, () => [rand() * 440, rand() * 340, rand() * 1.2 + 0.3]);
  return (
    <svg viewBox="0 0 440 340" className="h-auto w-full max-w-[460px]" aria-hidden>
      {dust.map(([x, y, r], i) => (
        <motion.circle key={i} cx={x} cy={y} r={r} fill="rgb(var(--star))" initial={{ opacity: 0.2 }} animate={{ opacity: [0.2, 0.8, 0.2] }} transition={{ duration: 3 + (i % 5), repeat: Infinity, delay: i * 0.05 }} />
      ))}
      {links.map(([a, b], i) => (
        <motion.line
          key={i}
          x1={stars[a][0]}
          y1={stars[a][1]}
          x2={stars[b][0]}
          y2={stars[b][1]}
          stroke="rgb(var(--star) / 0.55)"
          strokeWidth="1.2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ delay: 0.4 + i * 0.25, duration: 0.6 }}
        />
      ))}
      {stars.map(([x, y], i) => (
        <motion.g key={i} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 + i * 0.22, type: 'spring', stiffness: 260, damping: 14 }} style={{ transformOrigin: `${x}px ${y}px` }}>
          <circle cx={x} cy={y} r="14" fill="rgb(var(--star) / 0.12)" />
          <circle cx={x} cy={y} r={i === 5 ? 6 : 4} fill={i === 5 ? 'rgb(var(--amber))' : 'rgb(var(--star))'} style={{ filter: 'drop-shadow(0 0 6px rgb(255 255 255 / 0.8))' }} />
        </motion.g>
      ))}
    </svg>
  );
}

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="sky-panel relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <div className="[&_*]:!text-white">
          <Logo />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <HeroSky />
        </div>
        <div className="max-w-md">
          <p className="font-display text-3xl font-semibold leading-tight">Every topic is a star. Watch your sky fill with light.</p>
          <p className="mt-3 text-sm text-white/75">Orbit builds a study plan around your exams, your hours and your energy — and quietly re-plans when life happens.</p>
        </div>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <div className="glass p-6 sm:p-8">
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
