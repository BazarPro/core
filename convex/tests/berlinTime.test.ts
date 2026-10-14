import { describe, expect, test } from 'vitest';
import {
  berlinOffsetHours,
  berlinStartOfDay,
  eveningBefore,
  formatBerlinDate,
  formatBerlinRange,
  formatBerlinTime,
} from '../berlinTime';

describe('Berlin time', () => {
  test('summer and winter time switch on the last Sundays of March and October', () => {
    expect(berlinOffsetHours(Date.UTC(2026, 2, 29, 0, 59))).toBe(1);
    expect(berlinOffsetHours(Date.UTC(2026, 2, 29, 1, 0))).toBe(2);
    expect(berlinOffsetHours(Date.UTC(2026, 9, 25, 0, 59))).toBe(2);
    expect(berlinOffsetHours(Date.UTC(2026, 9, 25, 1, 0))).toBe(1);
  });

  test('formats dates, times and ranges in German', () => {
    // 9:00 in Berlin (summer time)
    const start = Date.UTC(2026, 9, 17, 7, 0);
    expect(formatBerlinDate(start)).toBe('Samstag, 17. Oktober 2026');
    expect(formatBerlinTime(start)).toBe('9:00');
    expect(formatBerlinRange(start, start + 2.5 * 3600_000)).toBe(
      'Samstag, 17. Oktober 2026, 9:00–11:30 Uhr'
    );
    expect(formatBerlinRange(start)).toBe('Samstag, 17. Oktober 2026, 9:00 Uhr');
    expect(formatBerlinRange(start, start + 24 * 3600_000)).toBe(
      'Samstag, 17. Oktober 2026, 9:00 Uhr bis Sonntag, 18. Oktober 2026, 9:00 Uhr'
    );
    // Winter: 23:30 UTC is already the next day in Berlin
    expect(formatBerlinDate(Date.UTC(2026, 11, 31, 23, 30))).toBe('Freitag, 1. Januar 2027');
  });

  test('the info mail is due at 18:00 the evening before', () => {
    const start = Date.UTC(2026, 9, 17, 7, 0);
    expect(berlinStartOfDay(start)).toBe(Date.UTC(2026, 9, 16, 22, 0));
    expect(eveningBefore(start)).toBe(Date.UTC(2026, 9, 16, 16, 0));
    // Day after the switch to winter time
    expect(berlinStartOfDay(Date.UTC(2026, 9, 26, 8, 0))).toBe(Date.UTC(2026, 9, 25, 23, 0));
    // Day of the switch to summer time: midnight was still winter time
    expect(berlinStartOfDay(Date.UTC(2026, 2, 29, 10, 0))).toBe(Date.UTC(2026, 2, 28, 23, 0));
  });
});
