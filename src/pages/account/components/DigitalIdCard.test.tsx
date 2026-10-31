import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutation, useQuery } from '../../../lib/api/react';
import { fetchOwnKeys } from '../../../lib/checkInCode';
import { DigitalIdCard } from './DigitalIdCard';

const client = vi.hoisted(() => ({}));
const generate = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/api/react', () => ({
  useApiClient: vi.fn(() => client),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));
vi.mock('../../../lib/checkInCode', async (actual) => ({
  ...(await actual<typeof import('../../../lib/checkInCode')>()),
  fetchOwnKeys: vi.fn(),
  currentCodes: vi.fn(async () => ['12345678']),
}));
// The value of the QR code as text
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <output>{value}</output>,
}));

const USER = '0b6f1c3e-6a5b-4c7d-8e9f-0a1b2c3d4e5f';
const KEYS = { userId: USER, keys: [{ eventId: 'evt1', version: 0, secret: 'c2VjcmV0' }] };

describe('DigitalIdCard', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue({ _id: USER } as never);
    generate.mockImplementation(async () => ({ token: 'tok', expires: Date.now() + 60_000 }));
    vi.mocked(useMutation).mockReturnValue(generate as never);
  });

  it('drops the time-based codes once the keys are gone', async () => {
    vi.mocked(fetchOwnKeys).mockResolvedValue(KEYS);
    render(<DigitalIdCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Ausweis anzeigen' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(`bazarpro://user/tok?o=${USER}.12345678`)
    );

    // Left the last bazaar: shown again, only the token
    vi.mocked(fetchOwnKeys).mockResolvedValue({ userId: USER, keys: [] });
    fireEvent.click(screen.getByRole('button', { name: /Ausblenden/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ausweis anzeigen' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/^bazarpro:\/\/user\/tok$/)
    );
  });
});
