import { Fragment } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { NAV, NAV_GROUPS } from './nav';
import { Logo, LogoMark } from './Logo';
import { useUIStore } from '@/store/useUIStore';
import { cn } from '@/lib/utils';

export const SIDEBAR_W = { expanded: 248, collapsed: 80 };

/**
 * Desktop sidebar: icon + text label for every page, grouped in workflow order.
 * Expanded by default; collapses to icons with tooltips.
 */
export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line/[0.08] bg-[rgb(var(--bg-0)/0.88)] backdrop-blur-xl transition-[width] duration-300 lg:flex"
      style={{ width: collapsed ? SIDEBAR_W.collapsed : SIDEBAR_W.expanded }}
    >
      <NavLink to="/" aria-label="Orbit home" className={cn('flex h-[72px] shrink-0 items-center border-b border-line/[0.08]', collapsed ? 'justify-center' : 'px-5')}>
        {collapsed ? <LogoMark className="h-9 w-9" /> : <Logo tagline={false} />}
      </NavLink>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {NAV.map(({ to, label, hint, group, icon: Icon }, i) => {
          const newGroup = i === 0 || NAV[i - 1].group !== group;
          return (
            <Fragment key={to}>
              {newGroup &&
                (collapsed ? (
                  i > 0 && <div className="mx-auto my-3 h-px w-8 bg-line/10" aria-hidden />
                ) : (
                  <p className={cn('eyebrow px-3 pb-2', i > 0 && 'pt-5')}>{NAV_GROUPS[group]}</p>
                ))}
              <NavLink to={to} end={to === '/'} className="group relative mb-1 block rounded-xl" aria-label={collapsed ? label : undefined}>
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="sidebar-active"
                        className="absolute inset-0 rounded-xl bg-[linear-gradient(135deg,rgb(var(--violet)/0.24),rgb(var(--cyan)/0.14))] ring-1 ring-violet/30"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    )}
                    <span
                      className={cn(
                        'relative flex h-11 items-center gap-3 rounded-xl text-sm transition-colors',
                        collapsed ? 'justify-center' : 'px-3',
                        isActive ? 'font-semibold text-ink' : 'text-muted group-hover:bg-line/[0.05] group-hover:text-ink',
                      )}
                    >
                      <Icon className={cn('h-[19px] w-[19px] shrink-0', isActive && 'text-violet')} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden />
                      {!collapsed && <span className="truncate">{label}</span>}
                    </span>
                    {collapsed && (
                      <span
                        role="tooltip"
                        className="glass-strong pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-medium text-ink opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                      >
                        {label}
                        <span className="block text-[10px] font-normal text-muted">{hint}</span>
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            </Fragment>
          );
        })}
      </div>

      <button
        onClick={toggle}
        className={cn('m-3 flex h-10 items-center gap-2 rounded-xl text-xs font-medium text-muted transition-colors hover:bg-line/[0.06] hover:text-ink', collapsed ? 'justify-center' : 'px-3')}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" aria-hidden /> : <ChevronsLeft className="h-4 w-4" aria-hidden />}
        {!collapsed && 'Collapse'}
      </button>
    </nav>
  );
}
