import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutation, useQuery } from '../../../lib/api/react';
import { getFunctionName } from '../../../lib/api/functions';
import { EditEventForm } from './EditEventForm';

vi.mock('../../../lib/api/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useApiClient: () => ({}),
  useAuthState: () => ({ isLoading: false, isAuthenticated: true }),
}));

// Radix checkboxes measure themselves; jsdom has no ResizeObserver
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const HOUR = 60 * 60 * 1000;
const editEvent = vi.fn().mockResolvedValue(undefined);
const createEvent = vi.fn().mockResolvedValue('event2');

function storedEvent(startDate: number) {
  return {
    _id: 'event1',
    title: 'Fahrradbörse',
    description: 'Gebrauchte Räder aus der Region',
    location: 'Bürgerhalle',
    startDate,
    endDate: startDate + 4 * HOUR,
    categories: ['bikes'],
    services: [],
    contactInfo: 'Verein, info@example.org',
    commission: 15,
    visibility: 'logged-in',
    accessCode: '',
    features: { discounts: true, maxDiscountPercent: 30, intakeFee: 2, maxItemsPerSeller: 10 },
    sellerLogistics: { note: 'Bitte Schloss mitbringen' },
    coverImageUrl: null,
    eventMapImageUrl: null,
  };
}

interface Setup {
  event?: ReturnType<typeof storedEvent> | null;
  feeLocked?: boolean;
  flags?: Record<string, boolean>;
}

function mockBackend({ event, feeLocked = false, flags = {} }: Setup) {
  vi.mocked(useQuery).mockImplementation(((ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (name === 'categories.getAllCategories')
      return [
        { _id: 'bikes', label: 'Fahrräder' },
        { _id: 'toys', label: 'Spielzeug' },
      ];
    if (name === 'events.getEvent') return event;
    if (name === 'events.getMyEvents') return [];
    if (name === 'events.getFeeLock') return { locked: feeLocked };
    if (name === 'eventLocationCategories.listForEvent') return [];
    if (name === 'featureFlags.get') return flags;
    return undefined;
  }) as typeof useQuery);
  vi.mocked(useMutation).mockImplementation(((ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (name === 'events.editEvent') return editEvent;
    if (name === 'events.createEvent') return createEvent;
    return vi.fn();
  }) as unknown as typeof useMutation);
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/events/new" element={<EditEventForm />} />
        <Route path="/events/edit/:eventId" element={<EditEventForm />} />
        <Route path="/events/view/:eventId" element={<p>Event-Dashboard</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  editEvent.mockClear();
  createEvent.mockClear();
});

describe('editing an event', () => {
  it('shows the full form with the stored values and saves the changes', async () => {
    mockBackend({ event: storedEvent(Date.now() + 24 * HOUR) });
    renderAt('/events/edit/event1');

    expect(screen.getByRole('heading', { name: 'Veranstaltung bearbeiten' })).toBeInTheDocument();
    expect(screen.queryByText(/Schritt \d von/)).not.toBeInTheDocument();
    const title = await screen.findByLabelText('Titel der Veranstaltung *');
    await waitFor(() => expect(title).toHaveValue('Fahrradbörse'));
    fireEvent.change(title, { target: { value: 'Fahrradbörse im Frühjahr' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(editEvent).toHaveBeenCalledTimes(1));
    expect(editEvent.mock.calls[0][0]).toMatchObject({
      id: 'event1',
      title: 'Fahrradbörse im Frühjahr',
      commission: 15,
      categories: ['bikes'],
      features: { intakeFee: 2, maxItemsPerSeller: 10, maxDiscountPercent: 30 },
      sellerLogistics: { note: 'Bitte Schloss mitbringen' },
    });
    expect(await screen.findByText('Event-Dashboard')).toBeInTheDocument();
  });

  it('keeps the fees sellers registered with: they may only go down', async () => {
    mockBackend({ event: storedEvent(Date.now() + 24 * HOUR), feeLocked: true });
    renderAt('/events/edit/event1');
    const commission = await screen.findByLabelText(/Provision/);
    await waitFor(() => expect(commission).toHaveValue(15));
    fireEvent.change(commission, { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(
      await screen.findByText('Verkäufer sind angemeldet: höchstens 15 %')
    ).toBeInTheDocument();
    expect(editEvent).not.toHaveBeenCalled();
  });

  it('says what is locked while the event runs', async () => {
    mockBackend({ event: storedEvent(Date.now() - HOUR) });
    renderAt('/events/edit/event1');
    expect(await screen.findByText(/Die Veranstaltung läuft gerade/)).toBeInTheDocument();
  });

  it('tells when the event does not exist', () => {
    mockBackend({ event: null });
    renderAt('/events/edit/missing');
    expect(screen.getByText('Event nicht gefunden')).toBeInTheDocument();
  });
});

describe('creation wizard', () => {
  const next = () => fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
  const fillBasics = (start: string, end: string) => {
    fireEvent.change(screen.getByLabelText('Titel der Veranstaltung *'), {
      target: { value: 'Kinderbasar' },
    });
    fireEvent.change(document.getElementById('description')!, {
      target: { value: 'Kleidung und Spielzeug für Kinder' },
    });
    fireEvent.change(screen.getByLabelText('Veranstaltungsort *'), {
      target: { value: 'Turnhalle' },
    });
    fireEvent.change(document.getElementById('startDate')!, { target: { value: start } });
    fireEvent.change(document.getElementById('endDate')!, { target: { value: end } });
    fireEvent.change(screen.getByLabelText('Kontaktdaten / Veranstalter-Info *'), {
      target: { value: 'Elternbeirat' },
    });
  };
  /** Picks the children's bazaar and goes through the settings to the details. */
  const toDetails = async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Kinderbasar/ }));
    for (const step of [3, 4, 5, 6]) {
      await screen.findByText(`Schritt ${step - 1} von 8`);
      next();
    }
    expect(await screen.findByText('Wann und wo?')).toBeInTheDocument();
  };

  it('does not move on with an end before the start, and goes back', async () => {
    mockBackend({});
    renderAt('/events/new');
    await toDetails();

    fillBasics('2099-04-18T13:00', '2099-04-18T09:00');
    next();
    expect(await screen.findByText('Enddatum muss nach dem Startdatum liegen')).toBeInTheDocument();
    expect(screen.getByText('Schritt 6 von 8')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(await screen.findByText('Schritt 5 von 8')).toBeInTheDocument();
  }, 20_000);

  it('a children’s bazaar preselects its categories and small labels', async () => {
    mockBackend({});
    renderAt('/events/new');
    fireEvent.click(screen.getByRole('button', { name: /^Kinderbasar/ }));
    next();
    expect(await screen.findByText('Welche Artikel?')).toBeInTheDocument();
    expect(screen.getByLabelText(/Etiketten/)).toHaveValue('small');
    for (const step of [4, 5, 6]) {
      next();
      await screen.findByText(`Schritt ${step} von 8`);
    }
    fillBasics('2099-04-18T09:00', '2099-04-18T13:00');
    next();
    await screen.findByText('Schritt 7 von 8');
    next();
    // The last step shows the bazaar page
    expect(await screen.findByText('So sieht dein Basar aus')).toBeInTheDocument();
    expect(screen.getByText('bazarpro.de/basar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Veranstaltung erstellen' }));
    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(createEvent.mock.calls[0][0]).toMatchObject({
      commission: 15,
      categories: ['toys'],
      contactInfo: 'Elternbeirat',
      features: { labelFormat: 'small', photosOptional: true, maxItemsPerSeller: 50 },
    });
  }, 20_000);

  it('Enter in a field moves to the next step instead of creating the event', async () => {
    mockBackend({});
    renderAt('/events/new');
    await toDetails();
    fillBasics('2099-04-18T09:00', '2099-04-18T13:00');
    fireEvent.submit(screen.getByLabelText('Veranstaltungsort *').closest('form')!);
    expect(await screen.findByText('Schritt 7 von 8')).toBeInTheDocument();
    expect(createEvent).not.toHaveBeenCalled();
  }, 20_000);

  it('shows that creating is switched off', () => {
    mockBackend({ flags: { is_event_creation_enabled: false } });
    renderAt('/events/new');
    expect(
      screen.getByText('Die Erstellung neuer Veranstaltungen ist derzeit deaktiviert.')
    ).toBeInTheDocument();
  });
});
