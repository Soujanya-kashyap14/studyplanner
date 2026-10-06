/** @type {import('tailwindcss').Config} */

// Every color is a CSS variable holding an "R G B" triplet so that
// (a) themes switch by swapping variables on <html data-theme="...">
// (b) Tailwind opacity modifiers still work, e.g. bg-violet/20.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="midnight"]'],
  theme: {
    // 8px spacing scale (Tailwind's default 4px steps are kept, but we
    // design on even steps: 2 = 8px, 4 = 16px, 6 = 24px, 8 = 32px ...)
    extend: {
      colors: {
        canvas: token('bg-0'),
        'canvas-2': token('bg-1'),
        ink: token('ink'),
        muted: token('ink-muted'),
        faint: token('ink-faint'),
        line: token('line'),
        glass: token('glass'),
        violet: token('violet'),
        cyan: token('cyan'),
        amber: token('amber'),
        rose: token('rose'),
        mint: token('mint'),
        'on-accent': token('on-accent'),
      },
      fontFamily: {
        display: ['Sora', 'Space Grotesk', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        xl: '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      boxShadow: {
        glass: '0 1px 0 0 rgb(var(--glass-hi) / 0.06) inset, 0 20px 50px -24px rgb(var(--shadow) / 0.55)',
        glow: '0 0 0 1px rgb(var(--violet) / 0.35), 0 10px 40px -10px rgb(var(--violet) / 0.45)',
        'glow-cyan': '0 0 0 1px rgb(var(--cyan) / 0.35), 0 10px 40px -10px rgb(var(--cyan) / 0.45)',
        'glow-amber': '0 0 0 1px rgb(var(--amber) / 0.4), 0 10px 40px -10px rgb(var(--amber) / 0.5)',
      },
      backdropBlur: { glass: '18px' },
      keyframes: {
        twinkle: { '0%,100%': { opacity: '0.35' }, '50%': { opacity: '1' } },
        'pulse-amber': {
          '0%,100%': { boxShadow: '0 0 0 0 rgb(var(--amber) / 0.55)' },
          '50%': { boxShadow: '0 0 0 8px rgb(var(--amber) / 0)' },
        },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        flicker: {
          '0%,100%': { transform: 'scaleY(1) translateY(0)' },
          '50%': { transform: 'scaleY(1.08) translateY(-1px)' },
        },
      },
      animation: {
        twinkle: 'twinkle 3.2s ease-in-out infinite',
        'pulse-amber': 'pulse-amber 2s ease-out infinite',
        shimmer: 'shimmer 1.4s linear infinite',
        flicker: 'flicker 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
