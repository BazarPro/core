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
    vendorLimit: undefined as number | undefined,
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
  admin?: boolean;
}

function mockBackend({ event, feeLocked = false, flags = {}, admin = false }: Setup) {
  vi.mocked(useQuery).mockImplementation(((ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (name === 'categories.getAllCategories')
      return [
        { _id: 'bikes', label: 'Fahrräder' },
        { _id: 'toys', label: 'Spielzeug' },
      ];
    if (name === 'events.getEvent') return event;
    if (name === 'events.getMyEvents') return [];
    if (name === 'events.getMyEventDraft') return null;
    if (name === 'events.getFeeLock') return { locked: feeLocked };
    if (name === 'eventLocationCategories.listForEvent') return [];
    if (name === 'featureFlags.get') return flags;
    if (name === 'users.viewer') return { systemRole: admin ? 'admin' : 'user' };
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
  // The wizard keeps every change as draft in the browser; each test starts afresh
  localStorage.clear();
});

describe('editing an event', () => {
  it('keeps a vendor limit that is not changed', async () => {
    mockBackend({ event: { ...storedEvent(Date.now() + 24 * HOUR), vendorLimit: 50 } });
    renderAt('/events/edit/event1');
    const limit = await screen.findByLabelText('Teilnehmerlimit für Verkäufer (optional)');
    await waitFor(() => expect(limit).toHaveValue(50));

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(editEvent).toHaveBeenCalledTimes(1));
    expect(editEvent.mock.calls[0][0]).toMatchObject({ vendorLimit: 50 });
    expect(editEvent.mock.calls[0][0].clearVendorLimit).toBeUndefined();
  });

  it('removes the vendor limit when the field is emptied', async () => {
    mockBackend({ event: { ...storedEvent(Date.now() + 24 * HOUR), vendorLimit: 50 } });
    renderAt('/events/edit/event1');
    const limit = await screen.findByLabelText('Teilnehmerlimit für Verkäufer (optional)');
    await waitFor(() => expect(limit).toHaveValue(50));

    fireEvent.change(limit, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(editEvent).toHaveBeenCalledTimes(1));
    expect(editEvent.mock.calls[0][0].clearVendorLimit).toBe(true);
    expect(editEvent.mock.calls[0][0].vendorLimit).toBeUndefined();
  });

  it('shows the full form with the stored values and saves the changes', async () => {
    mockBackend({ event: storedEvent(Date.now() + 24 * HOUR) });
    renderAt('/events/edit/event1');

    expect(screen.getByRole('heading', { name: 'Einstellungen' })).toBeInTheDocument();
    expect(screen.queryByText(/Schritt \d von/)).not.toBeInTheDocument();
    const title = await screen.findByLabelText('Titel des Basars *');
    await waitFor(() => expect(title).toHaveValue('Fahrradbörse'));
    fireEvent.change(title, { target: { value: 'Fahrradbörse im Frühjahr' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(editEvent).toHaveBeenCalledTimes(1));
    expect(editEvent.mock.calls[0][0]).toMatchObject({
      id: 'event1',
      title: 'Fahrradbörse im Frühjahr',
      accessCode: '',
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
    // The error is in the tab of the fees: it opens and is marked
    const fees = screen.getByRole('tab', { name: /Gebühren/ });
    await waitFor(() => expect(fees).toHaveAttribute('aria-selected', 'true'));
    expect(fees).toHaveAccessibleName(/Bitte prüfe/);
  });

  it('shows one tab at a time; the address opens one', async () => {
    mockBackend({ event: storedEvent(Date.now() + 24 * HOUR) });
    renderAt('/events/edit/event1?tab=registration');
    const tab = await screen.findByRole('tab', { name: 'Mitmachen' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Angebotssichtbarkeit');

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Termin & Ort' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Titel des Basars');
  });

  it('says what is locked while the event runs', async () => {
    mockBackend({ event: storedEvent(Date.now() - HOUR) });
    renderAt('/events/edit/event1');
    expect(await screen.findByText(/Der Basar läuft:/)).toBeInTheDocument();
    // The date is marked as locked, not only greyed out
    expect(screen.getAllByText('Gesperrt').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Beginn')).toHaveAttribute('readonly');
  });

  it('lets the platform admin change what is locked for organizers', async () => {
    mockBackend({ event: storedEvent(Date.now() - HOUR), feeLocked: true, admin: true });
    renderAt('/events/edit/event1');
    expect(await screen.findByText(/Du bist Admin/)).toBeInTheDocument();
    expect(screen.queryByText(/Der Basar läuft:/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Beginn')).not.toHaveAttribute('readonly');
    const commission = screen.getByLabelText(/Provision/);
    await waitFor(() => expect(commission).toHaveValue(15));
    fireEvent.change(commission, { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(editEvent).toHaveBeenCalledTimes(1));
    expect(editEvent.mock.calls[0][0]).toMatchObject({ commission: 25 });
  });

  it('tells when the event does not exist', () => {
    mockBackend({ event: null });
    renderAt('/events/edit/missing');
    expect(screen.getByText('Basar nicht gefunden')).toBeInTheDocument();
  });
});

describe('creation wizard', () => {
  const next = () => fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
  /** Date and place, the second step; the times as "HH:mm" on 18 April 2099. */
  const fillBasics = (start: string, end: string) => {
    fireEvent.change(screen.getByLabelText('Titel des Basars *'), {
      target: { value: 'Kinderbasar' },
    });
    fireEvent.change(screen.getByLabelText('Veranstaltungsort *'), {
      target: { value: 'Turnhalle' },
    });
    fireEvent.change(document.getElementById('startDay')!, { target: { value: '2099-04-18' } });
    fireEvent.change(document.getElementById('startTime')!, { target: { value: start } });
    fireEvent.change(document.getElementById('endTime')!, { target: { value: end } });
  };
  const fillDescription = () => {
    fireEvent.change(document.getElementById('description')!, {
      target: { value: 'Kleidung und Spielzeug für Kinder' },
    });
    fireEvent.change(screen.getByLabelText('Kontaktdaten / Veranstalter-Info *'), {
      target: { value: 'Elternbeirat' },
    });
  };

  it('does not move on with an end before the start, and goes back', async () => {
    mockBackend({});
    renderAt('/events/new');
    fireEvent.click(screen.getByRole('button', { name: /^Kinderbasar/ }));
    expect(await screen.findByText('Wann und wo?')).toBeInTheDocument();

    fillBasics('13:00', '09:00');
    next();
    expect(await screen.findByText('Enddatum muss nach dem Startdatum liegen')).toBeInTheDocument();
    expect(screen.getByText('Schritt 2 von 6')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(await screen.findByText('Schritt 1 von 6')).toBeInTheDocument();
  }, 20_000);

  it('a children’s bazaar preselects its categories and small labels', async () => {
    mockBackend({});
    renderAt('/events/new');
    fireEvent.click(screen.getByRole('button', { name: /^Kinderbasar/ }));
    expect(await screen.findByText('Wann und wo?')).toBeInTheDocument();
    fillBasics('09:00', '13:00');
    next();
    await screen.findByText('Schritt 3 von 6');
    expect(await screen.findByText('Artikel und Verkauf')).toBeInTheDocument();
    expect(screen.getByLabelText(/Etiketten/)).toHaveValue('small');
    for (const step of [4, 5]) {
      next();
      await screen.findByText(`Schritt ${step} von 6`);
    }
    fillDescription();
    next();
    // The last step shows the bazaar page
    expect(await screen.findByText('So sieht dein Basar aus')).toBeInTheDocument();
    expect(screen.getByText('bazarpro.de/basar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Basar anlegen' }));
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
    fireEvent.click(screen.getByRole('button', { name: /^Kinderbasar/ }));
    expect(await screen.findByText('Wann und wo?')).toBeInTheDocument();
    fillBasics('09:00', '13:00');
    fireEvent.submit(screen.getByLabelText('Veranstaltungsort *').closest('form')!);
    expect(await screen.findByText('Schritt 3 von 6')).toBeInTheDocument();
    expect(createEvent).not.toHaveBeenCalled();
  }, 20_000);

  it('shows that creating is switched off', () => {
    mockBackend({ flags: { is_event_creation_enabled: false } });
    renderAt('/events/new');
    expect(
      screen.getByText('Die Erstellung neuer Basare ist derzeit deaktiviert.')
    ).toBeInTheDocument();
  });
});
