import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  Copy,
  KeyRound,
  Link2,
  Lock,
  LockOpen,
  Package,
  Settings2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { Doc } from '../../lib/api/types';
import { api } from '../../lib/api/functions';
import { useMutation } from '../../lib/api/react';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { cn, formatDateTimeDE } from '../../lib/utils';
import { useNowPassing } from '../../hooks/useNowPassing';
import { getRegistrationState, registrationTimes } from '../../shared/eventFeatures';
import { VISIBILITY_OPTIONS } from '../../constants/records';
import { Button } from '../ui/button';
import { spotsLeft } from './registrationText';

type RegistrationPanelEvent = Pick<
  Doc<'events'>,
  '_id' | 'features' | 'vendorLimit' | 'sellerCount' | 'accessCode' | 'visibility' | 'endDate'
> & {
  /** Places for items left on the whole market; sent with `maxItemsTotal` */
  itemPlacesLeft?: number;
};

/** "12 / 50 Plätze" with a short bar that turns yellow once every place is taken. */
function Meter({
  icon,
  taken,
  limit,
  unit,
  label,
  leftText,
  fullText,
  testId,
}: {
  icon: ReactNode;
  taken: number;
  limit: number;
  unit: string;
  label: string;
  leftText: string;
  fullText: string;
  testId?: string;
}) {
  const full = taken >= limit;
  return (
    <div
      className="flex min-w-0 items-center gap-2"
      data-testid={testId}
      title={full ? fullText : leftText}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="tabular-nums">
        <span className="font-semibold">{taken}</span>
        <span className="text-muted-foreground"> / {limit}</span> {unit}
      </span>
      <span
        className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(taken, limit)}
        aria-label={label}
      >
        <span
          className={cn('block h-full rounded-full', full ? 'bg-tag' : 'bg-primary')}
          style={{ width: `${Math.min(100, (taken / limit) * 100)}%` }}
        />
      </span>
      <span
        className={cn('text-xs', full ? 'font-medium text-warning-soft-foreground' : 'sr-only')}
      >
        {full ? fullText : leftText}
      </span>
    </div>
  );
}

/**
 * How new sellers get in, in one slim bar above the sellers: whether the registration is
 * open (with the organizer's switch), the places taken, and whether a code is needed.
 * The details are one tap away in the settings.
 */
export function RegistrationPanel({
  event,
  canSwitch,
  sellers,
}: {
  event: RegistrationPanelEvent;
  /** Only the organizer opens and closes the registration */
  canSwitch: boolean;
  /**
   * The sellers of the list below. The backend counts the places taken only for a bazaar
   * with a limit (`sellerCount`); without one, this number is shown.
   */
  sellers?: number;
}) {
  const { t } = useTranslation('organizer');
  const setRegistrationOpen = useMutation(api.events.setRegistrationOpen);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  // Phones: the status in one line, the rest on a tap; the list of sellers comes sooner
  const [expanded, setExpanded] = useState(false);
  const now = useNowPassing([...registrationTimes(event), event.endDate]);
  if (event.endDate < now) return null;

  const state = getRegistrationState(event, now);
  const limit = event.vendorLimit && event.vendorLimit > 0 ? event.vendorLimit : undefined;
  const left = spotsLeft(event);
  const taken = event.sellerCount ?? sellers ?? 0;
  const full = left === 0;
  const maxItemsTotal =
    event.features?.maxItemsTotal && event.features.maxItemsTotal > 0
      ? event.features.maxItemsTotal
      : undefined;
  const itemsLeft = maxItemsTotal !== undefined ? event.itemPlacesLeft : undefined;
  const code = event.accessCode?.trim() || undefined;
  const linkOnly = event.visibility === 'approved';

  const tone = !state.open
    ? state.reason === 'notYet'
      ? 'waiting'
      : 'closed'
    : full
      ? 'full'
      : 'open';
  const statusText = {
    open: t('registrationPanel.open'),
    full: t('registrationPanel.full'),
    waiting: t('registrationPanel.notYet'),
    closed: t('registrationPanel.closed'),
  }[tone];
  const statusDetail = !state.open
    ? state.reason === 'notYet'
      ? t('registrationPanel.opensAt', { time: formatDateTimeDE(state.opensAt) })
      : t('registrationPanel.invitationOnly')
    : state.closesAt !== undefined
      ? t('registrationPanel.until', { time: formatDateTimeDE(state.closesAt) })
      : t('registrationPanel.noDeadline');

  const toggle = async () => {
    setIsSaving(true);
    try {
      await setRegistrationOpen({ eventId: event._id, open: !state.open });
      toast.success(
        t(state.open ? 'registrationPanel.closedToast' : 'registrationPanel.openedToast')
      );
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('registrationPanel.copyFailed'));
    }
  };

  return (
    <section
      aria-label={t('registrationPanel.title')}
      className="rounded-xl border bg-card shadow-xs"
      data-testid="registration-panel"
    >
      <div
        data-testid="registration-details"
        className="flex flex-wrap items-center gap-x-6 gap-y-2.5 px-4 py-3 text-sm sm:px-5"
      >
        {/* Open or not: the one thing to see first; on phones it opens the rest */}
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left sm:pointer-events-none sm:flex-none"
        >
          <span className="relative flex size-2.5 shrink-0" aria-hidden>
            {tone === 'open' && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
            )}
            <span
              className={cn(
                'relative inline-flex size-2.5 rounded-full',
                tone === 'open' && 'bg-success',
                tone === 'full' && 'bg-tag',
                tone === 'waiting' && 'bg-primary',
                tone === 'closed' && 'bg-muted-foreground/50'
              )}
            />
          </span>
          <span>
            <span className="sr-only">{t('registrationPanel.title')}: </span>
            <span className="font-semibold">{statusText}</span>
            <span className="text-muted-foreground"> · {statusDetail}</span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              'ml-auto size-4 shrink-0 transition-transform sm:hidden',
              expanded && 'rotate-180'
            )}
          />
        </button>
        <div
          className={cn(
            'contents',
            !expanded && 'max-sm:hidden',
            expanded &&
              'max-sm:flex max-sm:w-full max-sm:flex-col max-sm:items-start max-sm:gap-2.5'
          )}
        >
          {limit !== undefined ? (
            <Meter
              icon={<Users className="size-4" />}
              taken={taken}
              limit={limit}
              unit={t('registrationPanel.placesUnit')}
              label={t('registrationPanel.places')}
              leftText={t('registrationPanel.left', { count: left ?? 0 })}
              fullText={t('registrationPanel.noneLeft')}
            />
          ) : (
            <div className="flex items-center gap-2" title={t('registrationPanel.unlimitedHint')}>
              <Users className="size-4 text-muted-foreground" />
              <span>
                <span className="font-semibold">
                  {t('registrationPanel.summarySellers', { count: taken })}
                </span>
                <span className="text-muted-foreground"> · {t('registrationPanel.unlimited')}</span>
              </span>
            </div>
          )}

          {maxItemsTotal !== undefined &&
            (itemsLeft !== undefined ? (
              <Meter
                icon={<Package className="size-4" />}
                taken={Math.max(0, maxItemsTotal - itemsLeft)}
                limit={maxItemsTotal}
                unit={t('registrationPanel.items')}
                label={t('registrationPanel.itemPlaces')}
                leftText={t('registrationPanel.itemsLeft', { count: itemsLeft })}
                fullText={t('registrationPanel.noItemsLeft')}
                testId="item-places"
              />
            ) : (
              <div className="flex items-center gap-2" data-testid="item-places">
                <Package className="size-4 text-muted-foreground" />
                {t('registrationPanel.itemLimit', { count: maxItemsTotal })}
              </div>
            ))}

          <div className="flex min-w-0 items-center gap-2">
            <KeyRound className="size-4 shrink-0 text-muted-foreground" />
            {code ? (
              <>
                <code
                  className="rounded-md border border-dashed bg-muted/60 px-1.5 py-0.5 font-mono font-semibold tracking-wider"
                  title={t('registrationPanel.codeNeeded')}
                >
                  {code}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={t('registrationPanel.copyCode')}
                  title={t('registrationPanel.copyCode')}
                  onClick={() => void copyCode()}
                >
                  {copied ? (
                    <Check className="size-4 text-success-soft-foreground" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </>
            ) : (
              <span className="font-semibold" title={t('registrationPanel.noCodeHint')}>
                {t('registrationPanel.noCode')}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              · {linkOnly && <Link2 className="size-3.5" />}
              {VISIBILITY_OPTIONS[event.visibility].title}
            </span>
          </div>

          {canSwitch && (
            <div className="flex items-center gap-1 sm:ml-auto">
              <Button
                variant={state.open ? 'outline' : 'default'}
                size="sm"
                disabled={isSaving}
                onClick={() => void toggle()}
              >
                {state.open ? (
                  <>
                    <Lock className="size-4" /> {t('registrationPanel.close')}
                  </>
                ) : (
                  <>
                    <LockOpen className="size-4" />{' '}
                    {t(
                      state.reason === 'notYet'
                        ? 'registrationPanel.openNow'
                        : 'registrationPanel.reopen'
                    )}
                  </>
                )}
              </Button>
              <Button asChild variant="ghost" size="icon" className="size-8">
                <Link
                  to={`/events/view/${event._id}/settings?tab=registration`}
                  aria-label={t('registrationPanel.edit')}
                  title={t('registrationPanel.edit')}
                >
                  <Settings2 className="size-4" />
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
