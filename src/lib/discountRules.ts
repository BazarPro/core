import type { DiscountRules } from '../../convex/products';
import i18n from '../i18n';
import { dateLocale } from '../i18n/format';

/**
 * How the "discount" button looks for the running event: hidden when the organizer
 * switched discounts off, disabled with the start time while it is not reached yet.
 */
export function getDiscountButtonState(rules: DiscountRules | undefined): {
  visible: boolean;
  disabled: boolean;
  label: string;
} {
  const label = i18n.t('discount.button', { ns: 'seller' });
  if (!rules || rules.allowed) return { visible: true, disabled: false, label };
  if (rules.discountStartsAt && rules.discountStartsAt > Date.now()) {
    const time = new Date(rules.discountStartsAt).toLocaleTimeString(dateLocale(), {
      hour: '2-digit',
      minute: '2-digit',
    });
    return {
      visible: true,
      disabled: true,
      label: i18n.t('discount.from', { ns: 'seller', time }),
    };
  }
  return { visible: false, disabled: true, label };
}
