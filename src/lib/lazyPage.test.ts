import { afterEach, describe, expect, it, vi } from 'vitest';
import { isServerReachable } from './lazyPage';

describe('isServerReachable', () => {
  afterEach(() => vi.restoreAllMocks());

  it('asks the server even when the browser says online', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('no internet'));
    await expect(isServerReachable()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is fine with any answer of the server', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));
    await expect(isServerReachable()).resolves.toBe(true);
  });

  it('does not ask while the browser is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(isServerReachable()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
