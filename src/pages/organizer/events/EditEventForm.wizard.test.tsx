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
  useApiClient: () => ({ upload }),
  useAuthState: () => auth.current,
}));

const upload = vi.hoisted(() => vi.fn(async () => 'file1'));
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
        <Route path="/login" element={<RegisterStub />} />
      </Routes>
    </MemoryRouter>
  );
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

describe('event creation wizard', () => {
  beforeEach(() => {
    createEvent.mockClear();
    createLocationCategory.mockClear();
    upload.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(['cover'], { type: 'image/webp' })))
    );
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

  /** Fills the details step: title, description, place, address and time. */
  const fillDetails = (title: string) => {
    fireEvent.change(screen.getByLabelText('Titel der Veranstaltung *'), {
      target: { value: title },
    });
    fireEvent.change(document.getElementById('description')!, {
      target: { value: 'Von privat für privat' },
    });
    fireEvent.change(screen.getByLabelText('Veranstaltungsort *'), {
      target: { value: 'Münsterplatz' },
    });
    fireEvent.change(screen.getByLabelText('PLZ'), { target: { value: '89073' } });
    fireEvent.change(screen.getByLabelText('Ort'), { target: { value: 'Ulm' } });
    fireEvent.change(document.getElementById('startDate')!, {
      target: { value: '2099-04-18T09:00' },
    });
    fireEvent.change(document.getElementById('endDate')!, {
      target: { value: '2099-04-18T13:00' },
    });
    fireEvent.change(screen.getByLabelText('Kontaktdaten / Veranstalter-Info *'), {
      target: { value: 'KV Ulm, info@example.org' },
    });
  };

  it('creates a bike sale: settings first with previews, the details at the end', async () => {
    renderWizard();
    expect(screen.getByText('Schritt 1 von 8')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Fahrradbörse/ }));

    // Sale: the preview shows what buyers see of the switched-on features
    expect(await screen.findByText('Wie wird verkauft?')).toBeInTheDocument();
    expect(screen.getByText('VB · verhandelbar')).toBeInTheDocument();
    expect(screen.getByText('Preis vorschlagen')).toBeInTheDocument();
    expect(screen.queryByText(/−\d+ %/)).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Artikel rabattieren' }));
    expect(await screen.findByText(/−\d+ %/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Artikel rabattieren' }));
    next();

    // Items: the bike category is preselected, the label is the large one with price
    expect(await screen.findByText('Welche Artikel?')).toBeInTheDocument();
    expect(screen.getByText(/Großes Etikett/)).toBeInTheDocument();
    expect(screen.getByText('Erlaubt: Fahrräder')).toBeInTheDocument();
    next();

    // Fees: the preview works it out for one item
    expect(await screen.findByText('Was kostet es die Verkäufer?')).toBeInTheDocument();
    expect(screen.getByText('Ein Artikel für 140,00 €')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Provisionsgebühr (%)'), { target: { value: '20' } });
    expect((await screen.findAllByText('112,00 €')).length).toBeGreaterThan(0);
    next();

    expect(await screen.findByText('Wer darf mitmachen?')).toBeInTheDocument();
    next();

    // Details at the end; Austrian postal codes have four digits
    expect(await screen.findByText('Wann und wo?')).toBeInTheDocument();
    fillDetails('Fahrradbörse Ulm');
    fireEvent.change(screen.getByLabelText('Land'), { target: { value: 'AT' } });
    next();
    expect(await screen.findByText('Bitte eine gültige Postleitzahl eingeben')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Land'), { target: { value: 'DE' } });
    next();
    expect(await screen.findByText('Abgabe und Abholung')).toBeInTheDocument();
    next();

    // The bazaar page as visitors will see it
    expect(await screen.findByText('So sieht dein Basar aus')).toBeInTheDocument();
    expect(screen.getAllByText('Fahrradbörse Ulm').length).toBeGreaterThan(0);
    expect(screen.getByText('Hollandrad, 28 Zoll')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Veranstaltung erstellen' }));

    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(createEvent.mock.calls[0][0]).toMatchObject({
      title: 'Fahrradbörse Ulm',
      location: 'Münsterplatz',
      address: { street: '', postalCode: '89073', city: 'Ulm', country: 'DE' },
      commission: 20,
      categories: ['bikes'],
      contactInfo: 'KV Ulm, info@example.org',
      features: { priceOffers: true, minimumPrice: true, photosOptional: false },
    });
    // The new event opens right away
    expect(await screen.findByText('Event-Übersicht')).toBeInTheDocument();
  }, 20_000);

  it('starts with the template picked on the landing page, at the top of the page', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderWizard('/events/new?type=skiBazaar');
    // The template is applied and the wizard is on its second step
    expect(await screen.findByText('Wie wird verkauft?')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Verhandeln vor Ort/ })).toBeChecked();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    next();
    expect(await screen.findByText('Welche Artikel?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Spielzeug'));
    next();
    expect(await screen.findByText('Was kostet es die Verkäufer?')).toBeInTheDocument();
    next();
    expect(await screen.findByText('Wer darf mitmachen?')).toBeInTheDocument();
    next();
    // The template's name is the start of the title
    expect(await screen.findByLabelText('Titel der Veranstaltung *')).toHaveValue('Skibasar');
    scrollTo.mockRestore();
  }, 20_000);

  it('lets visitors set up a bazaar and creates it right after the sign-up', async () => {
    auth.current = { isLoading: false, isAuthenticated: false };
    const view = renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Ohne Vorlage weiter' }));

    expect(await screen.findByText('Wie wird verkauft?')).toBeInTheDocument();
    next();
    expect(await screen.findByText('Welche Artikel?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Spielzeug'));
    next();
    expect(await screen.findByText('Was kostet es die Verkäufer?')).toBeInTheDocument();
    next();
    expect(await screen.findByText('Wer darf mitmachen?')).toBeInTheDocument();
    next();

    expect(await screen.findByText('Wann und wo?')).toBeInTheDocument();
    // Pictures cannot wait in the browser until the account exists
    expect(screen.queryByText('Titelbild')).toBeNull();
    fillDetails('Kinderbasar Kita');
    fireEvent.change(screen.getByPlaceholderText('z. B. Reihe 1, Raum 23a'), {
      target: { value: 'Halle 2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Zur Liste hinzufügen' }));
    next();
    expect(await screen.findByText('Abgabe und Abholung')).toBeInTheDocument();
    next();
    expect(await screen.findByText('So sieht dein Basar aus')).toBeInTheDocument();
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
      location: 'Münsterplatz',
      categories: ['toys'],
      contactInfo: 'KV Ulm, info@example.org',
    });
    expect(createLocationCategory).toHaveBeenCalledWith({ eventId: 'event1', label: 'Halle 2' });
    expect(await screen.findByText('Event-Übersicht')).toBeInTheDocument();
    expect(localStorage.getItem('bazarpro.eventDraft')).toBeNull();
  }, 20_000);

  it('asks for the discount start after the dates, so the first steps cannot get stuck', async () => {
    renderWizard('/events/new?type=kidsBazaar');
    expect(await screen.findByText('Wie wird verkauft?')).toBeInTheDocument();
    // Discounts are on, but the day comes later: nothing here needs the dates
    expect(document.getElementById('discountStartsAt')).toBeNull();
    next();
    expect(await screen.findByText('Welche Artikel?')).toBeInTheDocument();
    next();
    expect(await screen.findByText('Was kostet es die Verkäufer?')).toBeInTheDocument();
    next();
    expect(await screen.findByText('Wer darf mitmachen?')).toBeInTheDocument();
    next();

    // Only with both dates can it be chosen, and it has to lie within them
    expect(await screen.findByText('Wann und wo?')).toBeInTheDocument();
    const discountStart = document.getElementById('discountStartsAt') as HTMLInputElement;
    expect(discountStart).toBeDisabled();
    fillDetails('Kinderbasar Kita');
    expect(discountStart).toBeEnabled();
    expect(discountStart.min).toBe('2099-04-18T09:00');
    fireEvent.change(discountStart, { target: { value: '2099-04-19T09:00' } });
    next();
    expect(
      await screen.findByText('Der Rabattbeginn muss innerhalb der Veranstaltung liegen')
    ).toBeInTheDocument();
    fireEvent.change(discountStart, { target: { value: '2099-04-18T12:00' } });
    next();
    expect(await screen.findByText('Abgabe und Abholung')).toBeInTheDocument();
    next();

    // The template's picture is preselected and uploaded with the new bazaar
    expect(await screen.findByText('So sieht dein Basar aus')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vorlage „Holzeisenbahn“ wählen' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Veranstaltung erstellen' }));
    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/images/covers/kids.webp');
    expect(createEvent.mock.calls[0][0]).toMatchObject({
      coverImage: 'file1',
      features: { discounts: true, discountStartsAt: new Date('2099-04-18T12:00').getTime() },
    });
  }, 20_000);

  it('creates the bazaar without a picture when none is chosen or it cannot be loaded', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Ohne Vorlage weiter' }));
    expect(await screen.findByText('Wie wird verkauft?')).toBeInTheDocument();
    next();
    expect(await screen.findByText('Welche Artikel?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Spielzeug'));
    next();
    expect(await screen.findByText('Was kostet es die Verkäufer?')).toBeInTheDocument();
    next();
    expect(await screen.findByText('Wer darf mitmachen?')).toBeInTheDocument();
    next();
    expect(await screen.findByText('Wann und wo?')).toBeInTheDocument();
    fillDetails('Kinderbasar Kita');
    next();
    expect(await screen.findByText('Abgabe und Abholung')).toBeInTheDocument();
    next();
    expect(await screen.findByText('So sieht dein Basar aus')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Veranstaltung erstellen' }));
    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(createEvent.mock.calls[0][0].coverImage).toBeUndefined();
    consoleError.mockRestore();
  }, 20_000);

  it('lets visitors pick a template, but own pictures need the login', async () => {
    auth.current = { isLoading: false, isAuthenticated: false };
    localStorage.setItem(
      'bazarpro.eventDraft',
      JSON.stringify({
        values: { title: 'Basar', coverTemplate: 'market' },
        pendingLocationCategories: [],
        savedAt: Date.now(),
      })
    );
    renderWizard();
    expect(await screen.findByText('So sieht dein Basar aus')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vorlage „Skipiste“ wählen' }));
    expect(screen.getByRole('button', { name: 'Vorlage „Skipiste“ wählen' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // One button each for the cover and the site plan
    const login = screen.getAllByRole('button', { name: 'Anmelden und hochladen' });
    expect(login).toHaveLength(2);
    fireEvent.click(login[1]);
    expect(await screen.findByText('Registrierung ?redirect=%2Fevents%2Fnew')).toBeInTheDocument();
    // The choice waits in the draft for the way back
    expect(JSON.parse(localStorage.getItem('bazarpro.eventDraft')!).values.coverTemplate).toBe(
      'ski'
    );
  }, 20_000);
});
