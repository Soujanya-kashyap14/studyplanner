import { forwardRef, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'amber';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  children?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    'text-on-accent bg-[linear-gradient(110deg,rgb(var(--violet)),rgb(var(--cyan)))] shadow-glow hover:brightness-110',
  secondary: 'text-ink bg-glass/[var(--glass-alpha)] border border-line/15 hover:border-violet/40 hover:bg-violet/10',
  ghost: 'text-muted hover:text-ink hover:bg-line/[0.06]',
  danger: 'text-rose border border-rose/30 bg-rose/10 hover:bg-rose/20',
  amber: 'text-on-accent bg-amber shadow-glow-amber hover:brightness-110',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-xl',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-2xl',
};

/** Primary action button with spring micro-interactions. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, iconRight, className, children, disabled, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileHover={disabled || loading ? undefined : { y: -1 }}
      whileTap={disabled || loading ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[filter,background-color,border-color,color] duration-200 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </motion.button>
  );
});

export interface IconButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  label: string;
  children: ReactNode;
  size?: 'sm' | 'md';
  active?: boolean;
}

/** Square icon-only button. `label` is required for screen readers. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, className, size = 'md', active, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.05 }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-line/[0.07] hover:text-ink',
        size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
        active && 'bg-violet/15 text-violet',
        className,
      )}
      {...rest}
    >
      {children}
    </motion.button>
  );
});
