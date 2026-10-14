import type { Doc } from '../../convex/_generated/dataModel';

type StoredLogistics = NonNullable<Doc<'events'>['sellerLogistics']>;

export interface LogisticsForm {
  dropoffStart: string;
  dropoffEnd: string;
  pickupStart: string;
  pickupEnd: string;
  note: string;
}

/** datetime-local values of the event form → timestamps; empty fields are left out. */
export function logisticsFromForm(logistics: LogisticsForm): StoredLogistics {
  const time = (value: string) => (value ? new Date(value).getTime() : undefined);
  return {
    dropoffStart: time(logistics.dropoffStart),
    dropoffEnd: time(logistics.dropoffEnd),
    pickupStart: time(logistics.pickupStart),
    pickupEnd: time(logistics.pickupEnd),
    note: logistics.note.trim() || undefined,
  };
}
