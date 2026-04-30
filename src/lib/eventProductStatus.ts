import type { EventProductStatus } from '../../convex/constants';
import { STATUS_OPTIONS } from '../constants/records';

export function getEventProductStatusTitle(status: string): string {
  if (Object.prototype.hasOwnProperty.call(STATUS_OPTIONS, status)) {
    return STATUS_OPTIONS[status as EventProductStatus].title;
  }
  return status;
}
