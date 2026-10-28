import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFunctionName } from '../lib/api/functions';
import { useAuthState, useConnected, useQuery } from '../lib/api/react';
import { fetchOwnKeys, ownKeysCurrent } from '../lib/checkInCode';
import { isOfflineAvailable } from '../lib/offlineMode';
import { OwnCheckInKeySync } from './OwnCheckInKeySync';

vi.mock('../lib/api/react', () => ({
  useApiClient: vi.fn(() => ({})),
  useAuthState: vi.fn(),
  useConnected: vi.fn(),
  useQuery: vi.fn(),
}));
vi.mock('../lib/checkInCode', () => ({ fetchOwnKeys: vi.fn(), ownKeysCurrent: vi.fn() }));
vi.mock('../lib/offlineMode', () => ({ isOfflineAvailable: vi.fn() }));

const VERSIONS = [{ eventId: 'evt1', version: 1 }];

describe('OwnCheckInKeySync', () => {
  beforeEach(() => {
    vi.mocked(fetchOwnKeys).mockReset().mockResolvedValue({ userId: 'u1', keys: [] });
    vi.mocked(ownKeysCurrent).mockReset();
    vi.mocked(isOfflineAvailable).mockReturnValue(true);
    vi.mocked(useAuthState).mockReturnValue({ isLoading: false, isAuthenticated: true });
    vi.mocked(useConnected).mockReturnValue(true);
    vi.mocked(useQuery).mockImplementation(((fn: unknown, args: unknown) => {
      if (args === 'skip') return undefined;
      return getFunctionName(fn) === 'users.viewer' ? { _id: 'u1' } : VERSIONS;
    }) as unknown as typeof useQuery);
  });

  it('fetches the own keys when they are not those of the current bazaars', async () => {
    vi.mocked(ownKeysCurrent).mockResolvedValue(false);
    render(<OwnCheckInKeySync />);
    await waitFor(() => expect(fetchOwnKeys).toHaveBeenCalledOnce());
    expect(ownKeysCurrent).toHaveBeenCalledWith('u1', VERSIONS);
  });

  it('keeps current keys', async () => {
    vi.mocked(ownKeysCurrent).mockResolvedValue(true);
    render(<OwnCheckInKeySync />);
    await waitFor(() => expect(ownKeysCurrent).toHaveBeenCalled());
    expect(fetchOwnKeys).not.toHaveBeenCalled();
  });

  it('does nothing offline or in the browser', () => {
    vi.mocked(useConnected).mockReturnValue(false);
    const { unmount } = render(<OwnCheckInKeySync />);
    unmount();
    vi.mocked(useConnected).mockReturnValue(true);
    vi.mocked(isOfflineAvailable).mockReturnValue(false);
    render(<OwnCheckInKeySync />);
    expect(ownKeysCurrent).not.toHaveBeenCalled();
  });
});
