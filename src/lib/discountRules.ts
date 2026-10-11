import type { DiscountRules } from '../../convex/products';

/**
 * How the "discount" button looks for the running event: hidden when the organizer
 * switched discounts off, disabled with the start time while it is not reached yet.
 */
export function getDiscountButtonState(rules: DiscountRules | undefined): {
  visible: boolean;
  disabled: boolean;
  label: string;
} {
  if (!rules || rules.allowed) return { visible: true, disabled: false, label: 'Rabatt' };
  if (rules.discountStartsAt && rules.discountStartsAt > Date.now()) {
    const time = new Date(rules.discountStartsAt).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return { visible: true, disabled: true, label: `Rabatt ab ${time} Uhr` };
  }
  return { visible: false, disabled: true, label: 'Rabatt' };
}
