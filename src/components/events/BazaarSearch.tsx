import {
  CalendarDays,
  Check,
  ChevronDown,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Doc } from '../../lib/api/types';
import {
  CONDITIONS,
  LOW_COMMISSION,
  RADII,
  WHEN,
  suggestPlaces,
  type Found,
} from '../../lib/bazaarSearch';
import type { BazaarSearchState } from '../../hooks/useBazaarSearch';
import { categoryName } from '../../i18n/categories';
import { groupCategories } from '../../shared/categoryTree';
import { formatEventPlace } from '../../shared/eventJsonLd';
import { eventFees } from '../../shared/feeGroups';
import { resolveEventFeatures } from '../../shared/eventFeatures';
import { isEventOver } from '../../shared/eventPhase';
import { describeRegistration } from '../participation/registrationText';
import { cn, formatDateRangeDE, formatPrice } from '../../lib/utils';
import { formatPercent } from '../../lib/sellerFees';
import { dateLocale } from '../../i18n/format';
import { Button } from '../ui/button';
import { ImageWithFallback } from '../ui/image-with-fallback';
import { Input } from '../ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

type Category = Doc<'categories'>;

/** Conditions shown at once; the others behind "Mehr Filter" */
const PRIMARY_CONDITIONS = 3;

/** Postal code or town, the radius and the own location: the top of the search. */
export function BazaarSearchBar<E extends Doc<'events'>>({
  search,
  className,
}: {
  search: BazaarSearchState<E>;
  className?: string;
}) {
  const { t } = useTranslation('events');
  const [text, setText] = useState(search.query);
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(false);
  const listId = useId();
  const fieldId = useId();
  const suggestions = search.places ? suggestPlaces(search.places, text) : [];

  useEffect(() => setText(search.query), [search.query]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFailed(false);
    search.search(text);
  };

  const findMe = () => {
    if (!navigator.geolocation) return setFailed(true);
    setLocating(true);
    setFailed(false);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        setText('');
        search.useHere([coords.latitude, coords.longitude]);
      },
      () => {
        setLocating(false);
        setFailed(true);
      },
      { maximumAge: 10 * 60 * 1000, timeout: 15_000 }
    );
  };

  return (
    <div className={className}>
      <form
        role="search"
        onSubmit={submit}
        className="flex flex-col gap-2 rounded-2xl border bg-card p-2 shadow-sm sm:flex-row sm:items-center"
      >
        <label htmlFor={fieldId} className="sr-only">
          {t('finder.where')}
        </label>
        <div className="relative min-w-0 flex-1">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-primary" />
          <Input
            id={fieldId}
            value={text}
            onChange={(change) => setText(change.target.value)}
            placeholder={t('finder.wherePlaceholder')}
            list={listId}
            autoComplete="postal-code"
            enterKeyHint="search"
            className="h-12 pl-11 text-base sm:text-lg"
          />
          <datalist id={listId}>
            {suggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <div className="flex items-center gap-2">
          <RadiusSelect value={search.radius} onChange={search.setRadius} />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            onClick={findMe}
            disabled={locating}
            aria-label={t('finder.myLocation')}
            title={t('finder.myLocation')}
          >
            {locating ? <LoaderCircle className="animate-spin" /> : <LocateFixed />}
          </Button>
          <Button type="submit" size="lg" className="h-11 flex-1 sm:flex-none">
            <Search />
            {t('finder.search')}
          </Button>
        </div>
      </form>
      <p aria-live="polite" className="mt-2 min-h-5 px-2 text-sm text-destructive">
        {failed
          ? t('finder.locationFailed')
          : search.unknown
            ? t('finder.unknownPlace', { query: search.query })
            : null}
      </p>
    </div>
  );
}

function RadiusSelect({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  const { t } = useTranslation('events');
  const id = useId();
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {t('finder.radius')}
      </label>
      <select
        id={id}
        value={value ?? 'any'}
        onChange={(change) =>
          onChange(change.target.value === 'any' ? undefined : Number(change.target.value))
        }
        className="h-11 appearance-none rounded-md border bg-background pl-3 pr-8 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        {RADII.map((km) => (
          <option key={km} value={km}>
            {t('finder.km', { km })}
          </option>
        ))}
        <option value="any">{t('finder.anyDistance')}</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

/** When, the conditions for sellers and the categories, as chips under the search. */
export function BazaarFilters<E extends Doc<'events'>>({
  search,
  categories,
}: {
  search: BazaarSearchState<E>;
  categories: readonly Category[] | undefined;
}) {
  const { t } = useTranslation('events');
  const [showAll, setShowAll] = useState(false);
  const mainCategories = useMemo(
    () => groupCategories(categories ?? []).map(({ category }) => category),
    [categories]
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          aria-label={t('finder.when.label')}
          // Fits a 320 px phone: the three parts share the width there
          className="flex w-full rounded-full border bg-muted p-0.5 min-[400px]:inline-flex min-[400px]:w-auto"
        >
          {WHEN.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={search.when === value}
              onClick={() => search.setWhen(value)}
              className={cn(
                'flex-1 whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring min-[400px]:flex-none min-[400px]:px-3',
                search.when === value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t(`finder.when.${value}`)}
            </button>
          ))}
        </div>
        {mainCategories.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Chip active={search.chosenCategories.length > 0}>
                <SlidersHorizontal className="size-3.5" />
                {search.chosenCategories.length > 0
                  ? t('finder.categoriesCount', { count: search.chosenCategories.length })
                  : t('finder.categories')}
                <ChevronDown className="size-3.5" />
              </Chip>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 min-w-56 overflow-y-auto">
              {mainCategories.map((category) => (
                <DropdownMenuCheckboxItem
                  key={category._id}
                  checked={search.chosenCategories.includes(category._id)}
                  onSelect={(select) => select.preventDefault()}
                  onCheckedChange={() => search.toggleCategory(category._id)}
                >
                  {categoryName(category)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {search.filtered && (
          <button
            type="button"
            onClick={search.reset}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-primary hover:underline"
          >
            <X className="size-3.5" />
            {t('finder.reset')}
          </button>
        )}
      </div>
      <div role="group" aria-label={t('finder.conditionsLabel')} className="flex flex-wrap gap-2">
        {CONDITIONS.filter(
          (condition, index) =>
            index < PRIMARY_CONDITIONS || showAll || search.conditions.includes(condition)
        ).map((condition) => {
          const active = search.conditions.includes(condition);
          return (
            <Chip
              key={condition}
              active={active}
              aria-pressed={active}
              title={t(`finder.conditionHints.${condition}`, { percent: LOW_COMMISSION })}
              onClick={() => search.toggleCondition(condition)}
            >
              {active && <Check className="size-3.5" />}
              {t(`finder.conditions.${condition}`, { percent: LOW_COMMISSION })}
            </Chip>
          );
        })}
        {!showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Plus className="size-3.5" />
            {t('finder.more')}
          </button>
        )}
      </div>
    </div>
  );
}

function Chip({
  active,
  children,
  ...props
}: { active: boolean; children: ReactNode } & React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-card hover:border-primary/50 hover:bg-accent'
      )}
    >
      {children}
    </button>
  );
}

/** "12 Basare im Umkreis von 25 km um 89073" above the results. */
export function BazaarResultsHeading<E extends Doc<'events'>>({
  search,
  id,
}: {
  search: BazaarSearchState<E>;
  id?: string;
}) {
  const { t } = useTranslation('events');
  if (!search.results) return null;
  const count = search.results.length;
  const place = search.origin?.label;
  return (
    <div className="space-y-1">
      <h2 id={id} className="text-lg font-semibold" aria-live="polite">
        {t('finder.results', { count })}{' '}
        <span className="font-normal text-muted-foreground">
          {place
            ? search.radius
              ? t('finder.around', { km: search.radius, place })
              : t('finder.aroundAny', { place })
            : t('finder.sortedByDate')}
        </span>
      </h2>
      {!place && !search.unknown && (
        <p className="text-sm text-muted-foreground">{t('finder.placeHint')}</p>
      )}
    </div>
  );
}

/** Nothing found: what to change, and to organize one where there is none. */
export function BazaarSearchEmpty<E extends Doc<'events'>>({
  search,
  onOrganize,
  noneText,
  hidden = 0,
}: {
  search: BazaarSearchState<E>;
  onOrganize?: () => void;
  /** Without place and filters: why there is nothing */
  noneText?: string;
  /** Found, but shown elsewhere: the seller's own bazaars */
  hidden?: number;
}) {
  const { t } = useTranslation('events');
  const wider = RADII.find((km) => search.radius !== undefined && km > search.radius);
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-6 py-10 text-center">
      <MapPin className="size-10 text-muted-foreground" />
      <p className="max-w-md text-muted-foreground">
        {search.unknown
          ? t('finder.unknownPlace', { query: search.query })
          : hidden > 0
            ? t('finder.allMine', { count: hidden })
            : search.filtered
              ? t('finder.noneFiltered')
              : search.origin && search.radius
                ? t('finder.noneAround', { km: search.radius })
                : (noneText ?? t('finder.noneAtAll'))}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {search.filtered && (
          <Button variant="outline" onClick={search.reset}>
            {t('finder.reset')}
          </Button>
        )}
        {search.origin && search.radius && (
          <Button variant="outline" onClick={() => search.setRadius(wider)}>
            {wider ? t('finder.widen', { km: wider }) : t('finder.anyDistance')}
          </Button>
        )}
      </div>
      {onOrganize && (
        <div className="mt-2 border-t pt-5">
          <p className="font-semibold">{t('finder.organizeTitle')}</p>
          <p className="mb-3 text-sm text-muted-foreground">{t('finder.organizeText')}</p>
          <Button onClick={onOrganize}>{t('finder.organize')}</Button>
        </div>
      )}
    </div>
  );
}

/** Day and month on the picture, as on a poster: "SA 14 MÄR" */
function DateBadge({ start }: { start: number }) {
  const date = new Date(start);
  const locale = dateLocale();
  return (
    <span className="absolute left-3 top-3 flex w-14 flex-col items-center rounded-xl bg-white py-1 text-zinc-900 shadow-md">
      <span className="text-[0.65rem] font-bold uppercase tracking-wide text-blue-700">
        {date.toLocaleDateString(locale, { weekday: 'short' }).replace('.', '')}
      </span>
      <span className="font-display text-xl font-extrabold leading-none">{date.getDate()}</span>
      <span className="text-[0.65rem] font-semibold uppercase">
        {date.toLocaleDateString(locale, { month: 'short' }).replace('.', '')}
      </span>
    </span>
  );
}

/**
 * A bazaar found: picture with its date, name, place and distance, and what a seller wants
 * to know at a glance. The whole card opens the bazaar; `actions` lie above it.
 */
export function BazaarResultCard({
  found: { event, distance },
  from,
  badge,
  status,
  actions,
}: {
  found: Found<Doc<'events'>>;
  /** Where the way back from the bazaar leads */
  from: string;
  /** On the picture, e.g. "Angemeldet" */
  badge?: ReactNode;
  /** Instead of registration and fees: the seller's own state at a bazaar they joined */
  status?: ReactNode;
  actions?: ReactNode;
}) {
  const { t } = useTranslation('events');
  const [now] = useState(() => Date.now());
  const over = isEventOver(event, now);
  const registration = describeRegistration(event, now);
  const features = resolveEventFeatures(event);
  const { commission, intakeFee } = eventFees(event);
  const facts = [
    t('facts.commission', { percent: formatPercent(commission) }),
    ...(intakeFee ? [t('facts.intakeFee', { fee: formatPrice(intakeFee) })] : []),
    ...(features.directSale ? [t('finder.conditions.directSale')] : []),
    // Only sellers from the region: "Nur aus PLZ 89…"
    ...(registration.region && !registration.blocked ? [registration.region] : []),
  ];
  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition-shadow hover:border-primary/40 hover:shadow-md',
        'has-[[data-card-link]:focus-visible]:ring-[3px] has-[[data-card-link]:focus-visible]:ring-ring',
        over && 'opacity-75'
      )}
    >
      {/* Own bazaars on phones: a flat picture, so the search below comes sooner */}
      <div
        className={cn(
          'relative aspect-[2/1] overflow-hidden bg-muted',
          status && 'max-sm:aspect-[7/2]'
        )}
      >
        <ImageWithFallback
          storageId={event.coverImage}
          alt=""
          className={cn(
            'size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]',
            over && 'grayscale-[0.5]'
          )}
        />
        <DateBadge start={event.startDate} />
        {badge && <span className="absolute right-3 top-3">{badge}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <h3 className="line-clamp-2 text-lg font-bold leading-snug" title={event.title}>
            <Link
              to={`/public-events/${event._id}`}
              state={{ from }}
              data-card-link
              className="outline-none after:absolute after:inset-0 after:content-['']"
            >
              {event.title}
            </Link>
          </h3>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-4 shrink-0" />
            {formatDateRangeDE(event.startDate, event.endDate)}
          </p>
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            {/* The town tells more here than the hall; the bazaar page has the address */}
            <span className="line-clamp-1 min-w-0">
              {event.city
                ? [event.postalCode, event.city].filter(Boolean).join(' ')
                : formatEventPlace(event)}
              {distance !== undefined && (
                <span className="font-semibold text-foreground">
                  {' · '}
                  {distance < 5
                    ? t('finder.nearby')
                    : t('finder.away', { km: Math.round(distance / 5) * 5 })}
                </span>
              )}
            </span>
          </p>
        </div>
        {status ? (
          <div>{status}</div>
        ) : (
          <div className="mt-auto flex flex-wrap gap-1.5">
            {!over && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  registration.blocked
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-success-soft text-success-soft-foreground'
                )}
              >
                {registration.blocked ?? (
                  <>
                    <Check className="size-3" />
                    {t('finder.registrationOpen')}
                  </>
                )}
              </span>
            )}
            {facts.map((fact) => (
              <span
                key={fact}
                className="rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
              >
                {fact}
              </span>
            ))}
          </div>
        )}
        {actions && <div className="relative z-10 mt-auto flex gap-2">{actions}</div>}
      </div>
    </article>
  );
}
