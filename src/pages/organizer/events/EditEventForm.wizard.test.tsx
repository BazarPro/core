import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutation, useQuery } from '../../../lib/api/react';
import { getFunctionName } from '../../../lib/api/functions';
import { EditEventForm } from './EditEventForm';

const auth = vi.hoisted(() => ({ current: { isLoading: false, isAuthenticated: true } }));
vi.mock('../../../lib/api/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useApiClient: () => ({}),
  useAuthState: () => auth.current,
}));

const createEvent = vi.fn().mockResolvedValue('event1');
const createLocationCategory = vi.fn().mockResolvedValue('loc1');

// Radix checkboxes measure themselves; jsdom has no ResizeObserver
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

function RegisterStub() {
  const location = useLocation();
  return <p>Registrierung {location.search}</p>;
}

function renderWizard(url = '/events/new') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/events/new" element={<EditEventForm />} />
        <Route path="/events/view/:eventId" element={<p>Event-Übersicht</p>} />
        <Route path="/register" element={<RegisterStub />} />
      </Routes>
    </MemoryRouter>
  );
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

describe('event creation wizard', () => {
  beforeEach(() => {
    createEvent.mockClear();
    createLocationCategory.mockClear();
    auth.current = { isLoading: false, isAuthenticated: true };
    localStorage.clear();
    vi.mocked(useQuery).mockImplementation(((ref: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(ref);
      if (name === 'categories.getAllCategories')
        return [
          { _id: 'bikes', label: 'Fahrräder' },
          { _id: 'toys', label: 'Spielzeug' },
        ];
      if (name === 'events.getMyEvents') return [];
      if (name === 'featureFlags.get') return {};
      return undefined;
    }) as typeof useQuery);
    vi.mocked(useMutation).mockImplementation(((ref: Parameters<typeof getFunctionName>[0]) =>
      getFunctionName(ref) === 'events.createEvent'
        ? createEvent
        : getFunctionName(ref) === 'eventLocationCategories.createCategory'
          ? createLocationCategory
          : vi.fn()) as unknown as typeof useMutation);
  });

  it('creates a bike market with the settings of its event type', async () => {
    renderWizard();
    expect(screen.getByText('Schritt 1 von 8')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Fahrradmarkt mit Nachweis/ }));

    // Basics
    expect(await screen.findByText('Schritt 2 von 8')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Titel der Veranstaltung *'), {
      target: { value: 'Fahrradmarkt Ulm' },
    });
    fireEvent.change(document.getElementById('description')!, {
      target: { value: 'Räder von privat für privat' },
    });
    fireEvent.change(screen.getByLabelText('Veranstaltungsort *'), {
      target: { value: 'Münsterplatz' },
    });
    fireEvent.change(screen.getByLabelText('PLZ'), { target: { value: '89073' } });
    fireEvent.change(screen.getByLabelText('Ort'), { target: { value: 'Ulm' } });
    // Austrian postal codes have four digits
    fireEvent.change(screen.getByLabelText('Land'), { target: { value: 'AT' } });
    fireEvent.change(document.getElementById('startDate')!, {
      target: { value: '2099-04-18T09:00' },
    });
    fireEvent.change(document.getElementById('endDate')!, {
      target: { value: '2099-04-18T13:00' },
    });
    next();
    expect(await screen.findByText('Bitte eine gültige Postleitzahl eingeben')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Land'), { target: { value: 'DE' } });
    next();

    // Sale: the type switched discounts off, the price goes on the label
    expect(await screen.findByText('Wie wird verkauft?')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Artikel rabattieren' })).not.toBeChecked();
    next();

    // Fees: a step does not move on while a required field is empty
    expect(await screen.findByText('Was kostet es die Verkäufer?')).toBeInTheDocument();
    next();
    expect(await screen.findByText('Was kostet es die Verkäufer?')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Kontaktdaten / Veranstalter-Info *'), {
      target: { value: 'KV Ulm, info@example.org' },
    });
    next();

    // Items: the bike category and the frame number are preselected
    expect(await screen.findByText('Welche Artikel?')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Rahmennummer' })).toBeChecked();
    next();
    expect(await screen.findByText('Wer darf mitmachen?')).toBeInTheDocument();
    next();
    expect(await screen.findByText('Abgabe und Abholung')).toBeInTheDocument();
    next();

    // Summary shows the conditions as sellers will see them
    expect(await screen.findByText('Alles im Blick')).toBeInTheDocument();
    expect(screen.getByText(/20 % Provision vom Verkaufspreis/)).toBeInTheDocument();
    expect(screen.getByText('Pflichtangaben für jeden Artikel: Rahmennummer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Veranstaltung erstellen' }));

    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(createEvent.mock.calls[0][0]).toMatchObject({
      title: 'Fahrradmarkt Ulm',
      location: 'Münsterplatz',
      address: { street: '', postalCode: '89073', city: 'Ulm', country: 'DE' },
      commission: 20,
      categories: ['bikes'],
      features: {
        fixedSellerData: true,
        privateSellersOnly: true,
        maxItemsPerSeller: 5,
        requiredFields: ['frameNumber'],
        questionsDuringEventOnly: true,
      },
    });
    // The new event opens right away
    expect(await screen.findByText('Event-Übersicht')).toBeInTheDocument();
  }, 20_000);

  it('lets visitors set up a bazaar and creates it right after the sign-up', async () => {
    auth.current = { isLoading: false, isAuthenticated: false };
    const view = renderWizard();
    expect(screen.getByText("Probier's aus – ganz ohne Konto")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ohne Vorlage weiter' }));

    expect(await screen.findByText('Wann und wo?')).toBeInTheDocument();
    // Pictures cannot wait in the browser until the account exists
    expect(screen.queryByText('Titelbild')).toBeNull();
    fireEvent.change(screen.getByLabelText('Titel der Veranstaltung *'), {
      target: { value: 'Kinderbasar Kita' },
    });
    fireEvent.change(document.getElementById('description')!, {
      target: { value: 'Kleidung und Spielzeug' },
    });
    fireEvent.change(screen.getByLabelText('Veranstaltungsort *'), {
      target: { value: 'Turnhalle Nord' },
    });
    fireEvent.change(document.getElementById('startDate')!, {
      target: { value: '2099-04-18T09:00' },
    });
    fireEvent.change(document.getElementById('endDate')!, {
      target: { value: '2099-04-18T13:00' },
    });
    fireEvent.change(screen.getByPlaceholderText('z. B. Reihe 1, Raum 23a'), {
      target: { value: 'Halle 2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Zur Liste hinzufügen' }));
    next();
    expect(await screen.findByText('Wie wird verkauft?')).toBeInTheDocument();
    next();
    expect(await screen.findByText('Was kostet es die Verkäufer?')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Kontaktdaten / Veranstalter-Info *'), {
      target: { value: 'kita@example.org' },
    });
    next();
    expect(await screen.findByText('Welche Artikel?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Spielzeug'));
    next();
    expect(await screen.findByText('Wer darf mitmachen?')).toBeInTheDocument();
    next();
    expect(await screen.findByText('Abgabe und Abholung')).toBeInTheDocument();
    next();
    expect(await screen.findByText('Alles im Blick')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Konto anlegen und Basar erstellen' }));

    expect(
      await screen.findByText('Registrierung ?redirect=%2Fevents%2Fnew%3Fdraft%3D1')
    ).toBeInTheDocument();
    expect(createEvent).not.toHaveBeenCalled();
    view.unmount();

    // Back from the sign-up: the bazaar is created without another click
    auth.current = { isLoading: false, isAuthenticated: true };
    renderWizard('/events/new?draft=1');
    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(createEvent.mock.calls[0][0]).toMatchObject({
      title: 'Kinderbasar Kita',
      location: 'Turnhalle Nord',
      categories: ['toys'],
      contactInfo: 'kita@example.org',
    });
    expect(createLocationCategory).toHaveBeenCalledWith({ eventId: 'event1', label: 'Halle 2' });
    expect(await screen.findByText('Event-Übersicht')).toBeInTheDocument();
    expect(localStorage.getItem('bazarpro.eventDraft')).toBeNull();
  }, 20_000);
});
