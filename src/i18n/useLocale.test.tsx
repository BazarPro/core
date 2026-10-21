import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMutation, useQuery } from '../lib/api/react';
import i18n from '.';
import { useSyncAccountLocale } from './useLocale';

vi.mock('../lib/api/react', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

const save = vi.fn(async () => null);

afterEach(async () => {
  save.mockClear();
  await i18n.changeLanguage('de');
});

function syncFor(viewer: { _id: string; locale?: 'de' | 'en' } | null | undefined) {
  vi.mocked(useMutation).mockReturnValue(save as never);
  vi.mocked(useQuery).mockReturnValue(viewer as never);
  return renderHook(() => useSyncAccountLocale());
}

describe('useSyncAccountLocale', () => {
  test("the account's language wins after login, once per account", async () => {
    const { rerender } = syncFor({ _id: 'u1', locale: 'en' });
    expect(i18n.language).toBe('en');
    await i18n.changeLanguage('de');
    rerender();
    expect(i18n.language).toBe('de');
    expect(save).not.toHaveBeenCalled();
  });

  test('an account without language gets the current one; nothing before the viewer loads', () => {
    syncFor(undefined);
    expect(save).not.toHaveBeenCalled();
    syncFor({ _id: 'u2' });
    expect(save).toHaveBeenCalledWith({ locale: 'de' });
    syncFor({ _id: 'u3', locale: 'de' });
    expect(save).toHaveBeenCalledTimes(1);
  });
});
