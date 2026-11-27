import {
  Check,
  ChevronDown,
  ClipboardList,
  Coins,
  Package,
  Percent,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  describeFeeGroups,
  describeSellerFees,
  describeSellerRules,
  describeSellerSchedule,
  formatPercent,
  type SellerConditionsEvent,
} from '../../lib/sellerFees';
import { eventFees } from '../../shared/feeGroups';
import { formatPrice } from '../../lib/utils';
import { useCategoryFieldDefinitions } from '../../hooks/useCategoryFields';
import { cn } from '../../lib/utils';
import { useTranslation } from 'react-i18next';
import type { Id } from '../../lib/api/types';
import { FeeGroupList, MyFeeGroup } from './FeeGroups';
import { RegionMapLink } from './RegionMap';

/**
 * What sellers agree to at a bazaar, only what applies (#303): fees with a worked example
 * that fits the kind of bazaar, hand-in and pickup times, what sellers must do and what
 * they can do. Shown before registering and to registered sellers; `compact` (bazaar page
 * sidebar) leaves out the example.
 */
export function SellerConditions({
  event,
  className,
  id,
  compact = false,
  eventId,
}: {
  event: SellerConditionsEvent;
  className?: string;
  id?: string;
  compact?: boolean;
  /** With it, a registered seller sees their fee group there (#302) */
  eventId?: Id<'events'>;
}) {
  const { t } = useTranslation('events');
  const { lines, example } = describeSellerFees(event);
  const fieldDefinitions = useCategoryFieldDefinitions();
  const { duties, options } = describeSellerRules(event, fieldDefinitions);
  const schedule = describeSellerSchedule(event);
  const groups = describeFeeGroups(event);
  // Beside the bazaar page the fees stay open, the rules behind one click
  const [allShown, setAllShown] = useState(!compact);
  const ruleCount = duties.length + options.length;

  return (
    <div id={id} className={className}>
      <h3 className="mb-4 flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-muted-foreground" /> {t('conditions.title')}
      </h3>

      <div className="divide-y [&>section]:py-4 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
        <ConditionsSection title={t('conditions.fees')}>
          {eventId && <MyFeeGroup eventId={eventId} event={event} />}
          {lines.length === 0 ? (
            <ul>
              <ConditionLine text={t('conditions.noFees')} />
            </ul>
          ) : (
            <ul className="space-y-2">
              {lines.map((line) => (
                <ConditionLine key={line} icon={Coins} text={line} />
              ))}
            </ul>
          )}
          <FeeGroupList groups={groups} />
          {example && !compact && (
            <div className="mt-3 rounded-md border bg-background p-3 text-sm">
              <p className="font-medium">{t('conditions.example')}</p>
              <p className="text-muted-foreground">{example.text}</p>
              {example.groups.map((group) => (
                <p key={group} className="mt-1 text-muted-foreground">
                  {group}
                </p>
              ))}
            </div>
          )}
        </ConditionsSection>

        {(schedule.rows.length > 0 || schedule.note) && (
          <ConditionsSection title={schedule.title}>
            {schedule.rows.length > 0 && (
              <dl className="space-y-2 text-sm">
                {schedule.rows.map((row) => (
                  <div key={row.label}>
                    <dt className="font-medium">{row.label}</dt>
                    <dd className="text-muted-foreground">{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {schedule.note && (
              <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">
                {schedule.note}
              </p>
            )}
          </ConditionsSection>
        )}

        {!allShown && ruleCount > 0 && (
          <section>
            <button
              type="button"
              onClick={() => setAllShown(true)}
              aria-expanded={false}
              className="flex w-full items-center justify-between gap-2 rounded-lg text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('conditions.showAll', { count: ruleCount })}
              <ChevronDown className="size-4" aria-hidden />
            </button>
          </section>
        )}
        {allShown &&
          [
            { key: 'duties', rules: duties },
            { key: 'options', rules: options },
          ].map(
            ({ key, rules }) =>
              rules.length > 0 && (
                <ConditionsSection key={key} title={t(`conditions.${key}` as 'conditions.duties')}>
                  <ul className="space-y-2">
                    {rules.map((rule) => (
                      <ConditionLine
                        key={rule.text}
                        allowed={rule.allowed}
                        text={
                          rule.regionCodes ? (
                            <RegionMapLink image={event.regionMapImage} codes={rule.regionCodes}>
                              {rule.text}
                            </RegionMapLink>
                          ) : (
                            rule.text
                          )
                        }
                      >
                        {rule.details && (
                          <details className="group">
                            <summary className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline">
                              {t('conditions.details')}
                            </summary>
                            <p className="mt-1 text-xs text-muted-foreground">{rule.details}</p>
                          </details>
                        )}
                      </ConditionLine>
                    ))}
                  </ul>
                </ConditionsSection>
              )
          )}
      </div>
    </div>
  );
}

function ConditionsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h4>
      {children}
    </section>
  );
}

function ConditionLine({
  text,
  allowed = true,
  icon,
  children,
}: {
  text: ReactNode;
  allowed?: boolean;
  icon?: LucideIcon;
  /** More about it below the text */
  children?: ReactNode;
}) {
  const Icon = icon ?? (allowed ? Check : X);
  return (
    <li className={cn('flex list-none gap-2 text-sm', !allowed && 'text-muted-foreground')}>
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          icon ? 'text-muted-foreground' : allowed && 'text-success-soft-foreground'
        )}
      />
      <div className="min-w-0">
        {text}
        {children}
      </div>
    </li>
  );
}

/**
 * The conditions in a few words, under the header of the bazaar page: commission, intake
 * fee and item limit as chips; the full conditions follow further down.
 */
export function ConditionFacts({
  event,
  detailsId,
}: {
  event: SellerConditionsEvent;
  /** Where the full conditions stand on the page */
  detailsId?: string;
}) {
  const { t } = useTranslation('events');
  const { commission, intakeFee = 0, maxItemsPerSeller } = eventFees(event);
  const facts: { icon: LucideIcon; text: string }[] = [
    { icon: Percent, text: t('facts.commission', { percent: formatPercent(commission) }) },
    ...(intakeFee > 0
      ? [{ icon: Coins, text: t('facts.intakeFee', { fee: formatPrice(intakeFee) }) }]
      : []),
    ...(maxItemsPerSeller
      ? [{ icon: Package, text: t('facts.maxItems', { count: maxItemsPerSeller }) }]
      : []),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="condition-facts">
      <span className="text-sm font-medium text-muted-foreground">{t('facts.title')}</span>
      {facts.map((fact) => (
        <span
          key={fact.text}
          className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm font-medium shadow-xs"
        >
          <fact.icon className="size-3.5 text-primary" aria-hidden />
          {fact.text}
        </span>
      ))}
      {detailsId && (
        <a
          href={`#${detailsId}`}
          onClick={(click) => {
            const target = document.getElementById(detailsId);
            if (!target) return;
            click.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          {t('facts.all')}
        </a>
      )}
    </div>
  );
}
