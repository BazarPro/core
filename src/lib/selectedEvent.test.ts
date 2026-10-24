import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  currentEvent,
  resetSelectedEvent,
  selectEvent,
  selectedOrCurrent,
  useSelectedEventId,
} from './selectedEvent';

const DAY = 24 * 3600 * 1000;
const now = Date.UTC(2026, 9, 22, 12);
const event = (id: string, startInDays: number, days = 1) => ({
  _id: id,
  startDate: now + startInDays * DAY,
  endDate: now + (startInDays + days) * DAY,
});

beforeEach(() => resetSelectedEvent());

describe('the most current event', () => {
  it('is the running one before any upcoming one', () => {
    expect(currentEvent([event('next', 2), event('running', -1, 3)], now)?._id).toBe('running');
  });

  it('is the next one when none runs', () => {
    expect(currentEvent([event('later', 30), event('next', 2), event('past', -9)], now)?._id).toBe(
      'next'
    );
  });

  it('is the last one that ended when all are over', () => {
    expect(currentEvent([event('older', -60), event('last', -9)], now)?._id).toBe('last');
    expect(currentEvent([], now)).toBeUndefined();
  });
});

describe('the chosen event', () => {
  it('wins while it is one of the events, else the most current one counts', () => {
    const events = [event('next', 2), event('past', -9)];
    expect(selectedOrCurrent(events, 'past')?._id).toBe('past');
    expect(selectedOrCurrent(events, 'gelöscht')?._id).toBe(currentEvent(events)?._id);
  });

  it('is shared by everyone who shows it and survives a reload', () => {
    const { result } = renderHook(() => useSelectedEventId());
    expect(result.current).toBeNull();
    act(() => selectEvent('e1'));
    expect(result.current).toBe('e1');
    expect(localStorage.getItem('bazarpro.selectedEvent')).toBe('e1');
  });
});
