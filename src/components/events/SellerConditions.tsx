import { Check, ClipboardList, X } from 'lucide-react';
import {
  describeSellerFees,
  describeSellerRules,
  describeSellerSchedule,
  formatSignedEuro,
  type SellerConditionsEvent,
} from '../../lib/sellerFees';
import { resolveEventFeatures } from '../../../convex/eventFeatures';
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
    <div id={id} className={cn('space-y-5', className)}>
      <p className="flex items-center gap-2 font-medium">
        <ClipboardList className="h-4 w-4 text-muted-foreground" /> {t('conditions.title')}
      </p>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold">{t('conditions.fees')}</h4>
        {lines.length === 0 ? (
          <p className="text-sm">{t('conditions.noFees')}</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {example && !compact && (
          <div className="rounded-md border bg-background p-3 text-sm">
            <p className="mb-2 font-medium">{t('conditions.example')}</p>
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
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold">{t('conditions.itemsAndPrices')}</h4>
        <ul className="space-y-1.5 text-sm">
          {rules.map((rule) => (
            <li
              key={rule.text}
              className={cn('flex gap-2', !rule.allowed && 'text-muted-foreground')}
            >
              {rule.allowed ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              ) : (
                <X className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              {rule.text}
            </li>
          ))}
        </ul>
      </section>

      {(schedule.rows.length > 0 || schedule.note) && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold">{t('conditions.schedule')}</h4>
          {schedule.rows.length > 0 && (
            <dl className="space-y-1 text-sm">
              {schedule.rows.map((row) => (
                <div key={row.label}>
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {schedule.note && <p className="text-sm whitespace-pre-line">{schedule.note}</p>}
        </section>
      )}
    </div>
  );
}
