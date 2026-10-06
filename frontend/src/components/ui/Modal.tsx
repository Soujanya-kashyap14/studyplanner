import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible dialog: focus trap, Escape to close, focus restore, scroll lock. */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restore.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>('input,select,textarea') ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }, 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && panel.current) {
        const els = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = '';
      restore.current?.focus?.();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-[rgb(var(--bg-0)/0.7)] backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            aria-describedby={description ? 'modal-desc' : undefined}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className={cn(
              'glass-strong relative max-h-[92dvh] w-full overflow-y-auto rounded-b-none p-6 sm:rounded-3xl',
              size === 'sm' && 'sm:max-w-sm',
              size === 'md' && 'sm:max-w-lg',
              size === 'lg' && 'sm:max-w-2xl',
            )}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="modal-title" className="text-lg font-semibold">
                  {title}
                </h2>
                {description && (
                  <p id="modal-desc" className="mt-1 text-sm text-muted">
                    {description}
                  </p>
                )}
              </div>
              <IconButton label="Close dialog" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            {children}
            {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Confirmation dialog for destructive actions. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Delete',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button className="h-10 rounded-xl px-4 text-sm text-muted hover:bg-line/[0.06] hover:text-ink" onClick={onClose}>
            Cancel
          </button>
          <button
            className="h-10 rounded-xl border border-rose/30 bg-rose/15 px-4 text-sm font-medium text-rose hover:bg-rose/25"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <span className="sr-only">{description}</span>
    </Modal>
  );
}
