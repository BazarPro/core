import type { Doc } from './api/types';

type StoredLogistics = NonNullable<Doc<'events'>['sellerLogistics']>;

export interface LogisticsForm {
  dropoffStart: string;
  dropoffEnd: string;
  pickupStart: string;
  pickupEnd: string;
  note: string;
  /** Switched off: no drop-off (setup) times, whatever the fields hold */
  dropoffOff?: boolean;
  /** Switched off: no pickup (teardown) times */
  pickupOff?: boolean;
}

/** datetime-local values of the event form → timestamps; empty or switched-off ones are left out. */
export function logisticsFromForm(logistics: LogisticsForm): StoredLogistics {
  const time = (value: string) => (value ? new Date(value).getTime() : undefined);
  const dropoff = !logistics.dropoffOff;
  const pickup = !logistics.pickupOff;
  return {
    dropoffStart: dropoff ? time(logistics.dropoffStart) : undefined,
    dropoffEnd: dropoff ? time(logistics.dropoffEnd) : undefined,
    pickupStart: pickup ? time(logistics.pickupStart) : undefined,
    pickupEnd: pickup ? time(logistics.pickupEnd) : undefined,
    note: logistics.note.trim() || undefined,
  };
}
