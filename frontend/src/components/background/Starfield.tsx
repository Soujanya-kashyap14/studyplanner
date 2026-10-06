import { useEffect, useRef } from 'react';
import { useUIStore } from '@/store/useUIStore';
import { useReducedMotion } from '@/hooks/useMotion';
import { seeded } from '@/lib/utils';

interface Star {
  x: number;
  y: number;
  r: number;
  depth: number; // 0.2 (far) .. 1 (near) — drives parallax and brightness
  phase: number;
  hue: number; // 0 white, 1 violet, 2 cyan
}

/**
 * Full-screen canvas starfield with slow drift + pointer parallax.
 * Midnight: crisp stars and an aurora wash. Dawn: sparse warm motes.
 * Reduced motion: a single static frame.
 */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useUIStore((s) => s.theme);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const rand = seeded(42);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let stars: Star[] = [];
    let raf = 0;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const dawn = theme === 'dawn';

    const build = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round((w * h) / (dawn ? 14000 : 5200));
      stars = Array.from({ length: count }, () => ({
        x: rand() * w,
        y: rand() * h,
        r: rand() * (dawn ? 1.6 : 1.2) + 0.3,
        depth: 0.2 + rand() * 0.8,
        phase: rand() * Math.PI * 2,
        hue: rand() < 0.82 ? 0 : rand() < 0.5 ? 1 : 2,
      }));
    };

    const colors = dawn
      ? ['120, 90, 170', '91, 71, 224', '232, 140, 100']
      : ['255, 255, 255', '190, 180, 255', '140, 235, 250'];

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;
      const drift = reduce ? 0 : t * 0.004;
      for (const s of stars) {
        const px = (s.x + drift * s.depth * 2 + pointer.x * s.depth * 18) % (w + 20);
        const py = s.y + pointer.y * s.depth * 18;
        const tw = reduce ? 0.8 : 0.55 + 0.45 * Math.sin(t * 0.0012 * (0.5 + s.depth) + s.phase);
        const a = (dawn ? 0.28 : 0.85) * s.depth * tw;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${colors[s.hue]}, ${a})`;
        ctx.arc(px < 0 ? px + w : px, py, s.r * (0.6 + s.depth * 0.6), 0, Math.PI * 2);
        ctx.fill();
        if (!dawn && s.depth > 0.92 && s.r > 1.1) {
          // Occasional soft halo on the nearest bright stars
          ctx.beginPath();
          ctx.fillStyle = `rgba(${colors[s.hue]}, ${a * 0.12})`;
          ctx.arc(px, py, s.r * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    const onMove = (e: PointerEvent) => {
      pointer.tx = e.clientX / w - 0.5;
      pointer.ty = e.clientY / h - 0.5;
    };
    const onResize = () => {
      build();
      if (reduce) draw(0);
    };

    build();
    if (reduce) draw(0);
    else raf = requestAnimationFrame(draw);
    window.addEventListener('resize', onResize);
    if (!reduce) window.addEventListener('pointermove', onMove, { passive: true });
    // Pause when the tab is hidden to save battery.
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) raf = requestAnimationFrame(draw);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [theme, reduce]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Aurora wash */}
      <div
        className="absolute -left-1/4 -top-1/3 h-[70vh] w-[80vw] rounded-full opacity-[0.35] blur-[120px]"
        style={{ background: 'radial-gradient(closest-side, rgb(var(--aurora-a) / 0.55), transparent)' }}
      />
      <div
        className="absolute -bottom-1/3 -right-1/4 h-[70vh] w-[70vw] rounded-full opacity-30 blur-[120px]"
        style={{ background: 'radial-gradient(closest-side, rgb(var(--aurora-b) / 0.5), transparent)' }}
      />
      <canvas ref={ref} className="absolute inset-0" />
    </div>
  );
}
