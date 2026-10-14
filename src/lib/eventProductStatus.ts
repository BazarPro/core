import type { EventProductStatus } from '../../convex/constants';
import { STATUS_OPTIONS } from '../constants/records';

export function getEventProductStatusTitle(status: string): string {
  if (Object.prototype.hasOwnProperty.call(STATUS_OPTIONS, status)) {
    return STATUS_OPTIONS[status as EventProductStatus].title;
  }
  return status;
}

export type PublicStatusFilter = 'all' | 'available' | 'sold';

/**
 * Status filter of the public product list. While the event runs, "available" means
 * handed in and not sold yet; announced items that never arrived and returned items
 * are hidden. Before the event, announced items are the preview of what is coming.
 */
export function matchesPublicStatusFilter(
  product: { sold?: boolean; status: string },
  filter: string,
  isRunning: boolean
): boolean {
  if (filter === 'sold') return !!product.sold || product.status === 'sold';
  if (filter === 'available') {
    if (isRunning) return product.status === 'available';
    return !product.sold && product.status !== 'sold' && product.status !== 'returned';
  }
  return true;
}
