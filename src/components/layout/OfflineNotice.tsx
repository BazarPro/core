import { WifiOff, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import { InfoTip } from '../ui/info-tip';
import { ReconnectButton } from './ReconnectButton';

/** The place in the header for notes about the connection */
export const HEADER_STATUS_ID = 'header-status';

/** How long the note stays open before it folds into its icon */
export const OFFLINE_NOTICE_OPEN_MS = 5000;

const TONES = {
  amber: 'border-warning-soft-foreground/30 bg-warning-soft text-warning-soft-foreground',
  destructive: 'border-destructive/40 bg-danger-soft text-destructive',
} as const;

/**
 * A small icon in the header while the connection is gone. Its note opens below it, folds
 * back into the icon after a few seconds and opens again on a tap; the details sit behind
 * an (i), so the page itself stays readable and does not move.
 */
export function OfflineNotice({
  title,
  details,
  badge,
  tone = 'amber',
  icon: Icon = WifiOff,
  reconnect = true,
}: {
  title: string;
  details?: ReactNode;
  /** A count at the icon, e.g. sales waiting to be booked, and what it counts in words */
  badge?: { count: number; label: string };
  tone?: keyof typeof TONES;
  icon?: LucideIcon;
  reconnect?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [held, setHeld] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => setSlot(document.getElementById(HEADER_STATUS_ID)), []);

  useEffect(() => {
    if (!open || held) return;
    const timer = window.setTimeout(() => setOpen(false), OFFLINE_NOTICE_OPEN_MS);
    return () => window.clearTimeout(timer);
  }, [open, held]);

  const note = (
    <div
      role="status"
      className={cn(
        'relative animate-in fade-in zoom-in-75 duration-300',
        !slot && 'fixed right-3 top-[calc(1rem+env(safe-area-inset-top))] z-50'
      )}
      onPointerEnter={(event) => event.pointerType === 'mouse' && setHeld(true)}
      onPointerLeave={(event) => event.pointerType === 'mouse' && setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={title}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          TONES[tone]
        )}
      >
        <Icon className="h-4 w-4" />
        {badge && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-tag px-1 text-[0.625rem] font-semibold leading-none text-tag-foreground">
            <span aria-hidden>{badge.count}</span>
            <span className="sr-only">{badge.label}</span>
          </span>
        )}
      </button>
      {/* Opens out of the icon and folds back into it */}
      <div
        aria-hidden={!open}
        className={cn(
          'absolute right-0 top-[calc(100%+0.75rem)] flex w-max max-w-[calc(100vw-1.5rem)] origin-top-right items-center gap-1.5 rounded-full border py-1 pl-3 pr-1 text-sm shadow-lg transition-[opacity,transform] duration-300 ease-out',
          TONES[tone],
          open ? 'opacity-100' : 'pointer-events-none -translate-y-2 scale-50 opacity-0'
        )}
      >
        <span className="truncate font-medium">{title}</span>
        {details && (
          <InfoTip className="text-current/70 hover:bg-current/10 hover:text-current">
            {details}
          </InfoTip>
        )}
        {reconnect && <ReconnectButton tabIndex={open ? undefined : -1} />}
      </div>
    </div>
  );

  return slot ? createPortal(note, slot) : note;
}
