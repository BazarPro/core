import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNowPassing } from './useNowPassing';

describe('useNowPassing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T09:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('updates once the time passes a boundary, not before', () => {
    const start = Date.now() + 60_000;
    const end = Date.now() + 120_000;
    const { result } = renderHook(() => useNowPassing([start, end]));
    expect(result.current < start).toBe(true);

    act(() => void vi.advanceTimersByTime(59_000));
    expect(result.current < start).toBe(true);

    act(() => void vi.advanceTimersByTime(2_000));
    expect(result.current >= start && result.current < end).toBe(true);

    act(() => void vi.advanceTimersByTime(60_000));
    expect(result.current >= end).toBe(true);
  });

  it('ignores past and missing times', () => {
    const { result } = renderHook(() => useNowPassing([Date.now() - 1000, undefined, null]));
    const first = result.current;
    act(() => void vi.advanceTimersByTime(3_600_000));
    expect(result.current).toBe(first);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('follows a moved boundary', () => {
    const { result, rerender } = renderHook(({ end }) => useNowPassing([end]), {
      initialProps: { end: Date.now() + 3_600_000 },
    });
    const moved = Date.now() + 10_000;
    rerender({ end: moved });
    act(() => void vi.advanceTimersByTime(11_000));
    expect(result.current >= moved).toBe(true);
  });
});
