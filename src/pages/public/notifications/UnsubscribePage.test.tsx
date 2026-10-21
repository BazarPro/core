import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutation, useQuery } from '../../../lib/api/react';
import { UnsubscribePage } from './UnsubscribePage';
import { NotificationsCard } from '../../account/components/NotificationsCard';

vi.mock('../../../lib/api/react', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const mutate = vi.fn();

function renderAt(search: string) {
  render(
    <MemoryRouter initialEntries={[`/benachrichtigungen/abbestellen${search}`]}>
      <UnsubscribePage />
    </MemoryRouter>
  );
}

describe('UnsubscribePage', () => {
  beforeEach(() => {
    mutate.mockReset().mockResolvedValue(undefined);
    vi.mocked(useMutation).mockReturnValue(mutate as unknown as ReturnType<typeof useMutation>);
  });

  it('unsubscribes only after a click', async () => {
    vi.mocked(useQuery).mockReturnValue({ category: 'Verkäufe', subscribed: true, canLogIn: true });
    renderAt(`?t=${'a'.repeat(32)}&k=sales`);
    expect(screen.getByRole('link', { name: /im Konto verwalten/ })).toHaveAttribute(
      'href',
      '/account#notifications'
    );
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Abbestellen' }));
    expect(await screen.findByText('Abbestellt')).toBeInTheDocument();
    expect(mutate).toHaveBeenCalledWith({ token: 'a'.repeat(32), category: 'sales' });
  });

  it('offers no account link to walk-in sellers, who cannot log in', () => {
    vi.mocked(useQuery).mockReturnValue({
      category: 'Verkäufe',
      subscribed: false,
      canLogIn: false,
    });
    renderAt(`?t=${'a'.repeat(32)}&k=sales`);
    expect(screen.getByText('Abbestellt')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /im Konto verwalten/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/wieder einschalten/)).not.toBeInTheDocument();
  });

  it('shows an error for unknown links', () => {
    vi.mocked(useQuery).mockReturnValue(undefined);
    renderAt('?t=abc&k=spam');
    expect(screen.getByText(/ungültig/)).toBeInTheDocument();
  });
});

describe('NotificationsCard', () => {
  it('switches a category off', () => {
    const update = Object.assign(vi.fn().mockResolvedValue(undefined), {
      withOptimisticUpdate: () => update,
    });
    vi.mocked(useMutation).mockReturnValue(update as unknown as ReturnType<typeof useMutation>);
    vi.mocked(useQuery).mockReturnValue({
      sales: true,
      offers: true,
      questions: false,
      buyer: true,
      reminders: true,
      organizer: true,
    });
    render(
      <MemoryRouter>
        <NotificationsCard />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Fragen')).not.toBeChecked();
    fireEvent.click(screen.getByLabelText('Verkäufe'));
    expect(update).toHaveBeenCalledWith({ prefs: { sales: false } });
  });
});
