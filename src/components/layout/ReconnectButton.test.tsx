import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { ReconnectButton } from './ReconnectButton';

const client = vi.hoisted(() => ({ reconnectNow: vi.fn() }));
vi.mock('../../lib/api/react', () => ({ useApiClient: () => client }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

describe('ReconnectButton', () => {
  beforeEach(() => {
    client.reconnectNow.mockReset();
    vi.mocked(toast.error).mockClear();
  });

  it('connects at once and waits while it does', async () => {
    let connect: (connected: boolean) => void = () => {};
    client.reconnectNow.mockReturnValue(new Promise<boolean>((resolve) => (connect = resolve)));
    render(<ReconnectButton />);
    const button = screen.getByRole('button', { name: 'Neu verbinden' });
    fireEvent.click(button);
    expect(client.reconnectNow).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
    connect(true);
    await waitFor(() => expect(button).toBeEnabled());
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('says when there is still no connection', async () => {
    client.reconnectNow.mockResolvedValue(false);
    render(<ReconnectButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Neu verbinden' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Noch keine Verbindung – versuch es gleich noch einmal.'
      )
    );
  });
});
