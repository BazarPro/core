import { Check, ClipboardList, Coins, X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  describeSellerFees,
  describeSellerRules,
  describeSellerSchedule,
  formatSignedEuro,
  type SellerConditionsEvent,
} from '../../lib/sellerFees';
import { resolveEventFeatures } from '../../shared/eventFeatures';
import { cn, formatPriceDE } from '../../lib/utils';
import { useTranslation } from 'react-i18next';

/**
 * What sellers agree to at a bazaar: fees with a worked example, item limit, price
 * features and hand-in/pickup times. Shown before registering and to registered
 * sellers; `compact` (bazaar page sidebar) leaves out the example and what the
 * bazaar does not offer.
 */
export function SellerConditions({
  event,
  className,
  id,
  compact = false,
}: {
  event: SellerConditionsEvent;
  className?: string;
  id?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation('events');
  const { lines, example } = describeSellerFees({
    commission: event.commission,
    intakeFee: resolveEventFeatures(event).intakeFee,
  });
  const rules = describeSellerRules(event).filter((rule) => !compact || rule.allowed);
  const schedule = describeSellerSchedule(event);

  return (
    <div id={id} className={className}>
      <h3 className="mb-4 flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-muted-foreground" /> {t('conditions.title')}
      </h3>

      <div className="divide-y [&>section]:py-4 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
        <ConditionsSection title={t('conditions.fees')}>
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
          {example && !compact && (
            <div className="mt-3 rounded-md border bg-background p-3 text-sm">
              <p className="font-medium">{t('conditions.example')}</p>
              <p className="mb-2 text-muted-foreground">{example.intro}</p>
              <table className="w-full tabular-nums">
                <tbody>
                  {example.rows.map((row) => (
                    <tr key={row.label}>
                      <td className="py-0.5 pr-3">{row.label}</td>
                      <td
                        className={cn(
                          'py-0.5 text-right whitespace-nowrap',
                          row.amount < 0 && 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {formatSignedEuro(row.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t font-semibold">
                    <td className="pt-1.5 pr-3">
                      {example.total >= 0 ? t('conditions.youGet') : t('conditions.youPay')}
                    </td>
                    <td className="pt-1.5 text-right whitespace-nowrap">
                      {formatPriceDE(Math.abs(example.total))} €
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </ConditionsSection>

        <ConditionsSection title={t('conditions.itemsAndPrices')}>
          <ul className="space-y-2">
            {rules.map((rule) => (
              <ConditionLine key={rule.text} allowed={rule.allowed} text={rule.text} />
            ))}
          </ul>
        </ConditionsSection>

        {(schedule.rows.length > 0 || schedule.note) && (
          <ConditionsSection title={t('conditions.schedule')}>
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
}: {
  text: string;
  allowed?: boolean;
  icon?: LucideIcon;
}) {
  const Icon = icon ?? (allowed ? Check : X);
  return (
    <li className={cn('flex list-none gap-2 text-sm', !allowed && 'text-muted-foreground')}>
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          icon ? 'text-muted-foreground' : allowed && 'text-green-600'
        )}
      />
      {text}
    </li>
  );
}
