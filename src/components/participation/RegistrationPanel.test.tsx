import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Doc, Id } from '../../lib/api/types';
import { RegistrationPanel } from './RegistrationPanel';

const setRegistrationOpen = vi.hoisted(() => vi.fn());
vi.mock('../../lib/api/react', () => ({ useMutation: () => setRegistrationOpen }));

const HOUR = 3_600_000;
const eventId = '0199f2a4-7c1e-7b3a-9d2e-5f6a7b8c9d0e' as Id<'events'>;

function renderPanel(
  event: Partial<Doc<'events'>> & { itemPlacesLeft?: number } = {},
  canSwitch = true,
  sellers?: number
) {
  render(
    <MemoryRouter>
      <RegistrationPanel
        canSwitch={canSwitch}
        sellers={sellers}
        event={{ _id: eventId, visibility: 'public', endDate: Date.now() + 24 * HOUR, ...event }}
      />
    </MemoryRouter>
  );
}

describe('registration on the sellers page', () => {
  beforeEach(() => setRegistrationOpen.mockReset().mockResolvedValue(null));

  it('shows the places taken out of the limit', () => {
    renderPanel({ vendorLimit: 50, sellerCount: 30 });
    expect(screen.getByText('30')).toBeVisible();
    expect(screen.getByText('/ 50')).toBeVisible();
    expect(screen.getByText('Noch 20 Plätze frei')).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30');
  });

  it('counts the sellers when there is no limit', () => {
    renderPanel({ sellerCount: 1 });
    expect(screen.getByText('1 Verkäufer')).toBeVisible();
    expect(screen.getByText(/Kein Limit/)).toBeVisible();
  });

  it('without a limit the backend counts no places: the sellers of the list are shown', () => {
    renderPanel({}, true, 4);
    expect(screen.getByText('4 Verkäufer')).toBeVisible();
  });

  it('says when all places are taken', () => {
    renderPanel({ vendorLimit: 50, sellerCount: 50 });
    expect(
      within(screen.getByTestId('registration-details')).getByText('Voll belegt')
    ).toBeVisible();
    expect(screen.getByText('Alle Plätze belegt')).toBeVisible();
  });

  it('shows the places for items of the whole market next to the sellers', () => {
    renderPanel({
      vendorLimit: 50,
      sellerCount: 30,
      features: { maxItemsTotal: 400 },
      itemPlacesLeft: 100,
    });
    const items = within(screen.getByTestId('item-places'));
    expect(items.getByText('300')).toBeVisible();
    expect(items.getByText('/ 400')).toBeVisible();
    expect(items.getByText('Noch 100 Artikel möglich')).toBeVisible();
    expect(items.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '300');
    expect(screen.getByText('Noch 20 Plätze frei')).toBeVisible();
  });

  it('says when all places for items are taken, also without a seller limit', () => {
    renderPanel({ features: { maxItemsTotal: 400 }, itemPlacesLeft: 0 });
    expect(screen.getByText(/Kein Limit/)).toBeVisible();
    expect(screen.getByText('Alle Plätze für Artikel belegt')).toBeVisible();
  });

  it('shows no places for items without a limit for them', () => {
    renderPanel({ vendorLimit: 50, sellerCount: 30 });
    expect(screen.queryByTestId('item-places')).toBeNull();
  });

  it('shows the access code sellers need', () => {
    renderPanel({ accessCode: 'SKI2026', visibility: 'approved' });
    expect(screen.getByText('SKI2026')).toBeVisible();
    expect(screen.getByTitle('Verkäufer brauchen diesen Code zum Anmelden')).toBeVisible();
    expect(screen.getByText(/Nur mit Link und Zugangscode/)).toBeVisible();
  });

  it('lets the organizer close and open the registration', async () => {
    renderPanel({ features: { registrationEndsAt: Date.now() + HOUR } });
    expect(within(screen.getByTestId('registration-details')).getByText('Offen')).toBeVisible();
    expect(screen.getByText(/· Bis /)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Anmeldung schließen' }));
    await waitFor(() => expect(setRegistrationOpen).toHaveBeenCalledWith({ eventId, open: false }));
  });

  it('offers to open a closed registration, not to helpers', () => {
    renderPanel({ features: { registrationOpen: false } });
    expect(
      within(screen.getByTestId('registration-details')).getByText('Geschlossen')
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Anmeldung öffnen' })).toBeVisible();

    renderPanel({ features: { registrationOpen: false } }, false);
    expect(screen.getAllByRole('button', { name: 'Anmeldung öffnen' })).toHaveLength(1);
  });

  it('is gone once the bazaar is over', () => {
    renderPanel({ endDate: Date.now() - HOUR });
    expect(screen.queryByTestId('registration-panel')).toBeNull();
  });
});
