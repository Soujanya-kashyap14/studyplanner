import { now } from '@/lib/clock';
import { useTick } from '@/hooks/useMotion';
import { cn } from '@/lib/utils';

/** Live "T-minus" countdown in JetBrains Mono: T-05d 14h 22m 09s. */
export function Countdown({ to, className, showSeconds = true }: { to: string; className?: string; showSeconds?: boolean }) {
  useTick(showSeconds ? 1000 : 30_000);
  const ms = new Date(to).getTime() - now().getTime();
  const past = ms <= 0;
  const t = Math.abs(ms) / 1000;
  const dd = Math.floor(t / 86400);
  const hh = Math.floor((t % 86400) / 3600);
  const mm = Math.floor((t % 3600) / 60);
  const ss = Math.floor(t % 60);
  const p = (n: number) => String(n).padStart(2, '0');
  const urgent = !past && dd < 3;
  return (
    <span
      className={cn('flex items-baseline gap-1 font-mono text-xs tabular-nums', urgent ? 'text-amber' : 'text-muted', className)}
      aria-label={past ? 'Already passed' : `${dd} days ${hh} hours ${mm} minutes remaining`}
    >
      <span className="font-bold">{past ? 'T+' : 'T-'}</span>
      <span>{p(dd)}d</span>
      <span>{p(hh)}h</span>
      <span>{p(mm)}m</span>
      {showSeconds && <span className="opacity-70">{p(ss)}s</span>}
    </span>
  );
}
