import type { EventProductStatus } from '../shared/constants';
import { STATUS_OPTIONS } from '../constants/records';

export function getEventProductStatusTitle(status: string): string {
  if (Object.prototype.hasOwnProperty.call(STATUS_OPTIONS, status)) {
    return STATUS_OPTIONS[status as EventProductStatus].title;
  }
  return status;
}

/**
 * What visitors see of a bazaar's offer, in the preview and in the full list alike: only
 * items handed in and not sold yet. Announced items may never arrive, so the offer fills
 * up with the drop-off and the start of the bazaar.
 */
export function isOnOffer(product: { sold?: boolean; status: string }): boolean {
  return product.status === 'available' && !product.sold;
}
