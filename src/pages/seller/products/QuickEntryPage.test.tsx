import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutation, useQuery } from 'convex/react';
import { getFunctionName, type FunctionReference } from 'convex/server';
import { QuickEntryPage } from './QuickEntryPage';

vi.mock('convex/react', () => ({ useQuery: vi.fn(), useMutation: vi.fn(), useConvex: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../../lib/productQRCodePdf', () => ({ downloadLabelsPdf: vi.fn() }));
vi.mock('../../../components/navigation/BackButton', () => ({ BackButton: () => null }));

const CATEGORIES = [
  { _id: 'cat-clothes', label: 'Kinderkleidung' },
  { _id: 'cat-toys', label: 'Spielzeug' },
];
const KINDERBASAR = {
  _id: 'evt-kids',
  title: 'Kinderbasar',
  categories: ['cat-clothes', 'cat-toys'],
  features: { photosOptional: true },
};
const FAHRRADBOERSE = {
  _id: 'evt-bikes',
  title: 'Fahrradbörse',
  categories: [],
  features: {},
};

const addProducts = vi.fn();
const addExisting = vi.fn();
const generateUploadUrl = vi.fn();
let events: object[] = [KINDERBASAR];
let myProducts: object[] = [];

function renderPage() {
  render(
    <MemoryRouter>
      <QuickEntryPage />
    </MemoryRouter>
  );
}

describe('QuickEntryPage', () => {
  beforeEach(() => {
    events = [KINDERBASAR];
    addProducts.mockReset().mockResolvedValue([
      { productId: 'p1', title: 'Body' },
      { productId: 'p2', title: 'Hose' },
    ]);
    myProducts = [];
    addExisting.mockReset().mockResolvedValue(1);
    generateUploadUrl.mockReset().mockResolvedValue('https://upload.test/1');
    const mutations: Record<string, unknown> = {
      'products:addProductsToEvent': addProducts,
      'products:addExistingProductsToEvent': addExisting,
      'products:generateUploadUrl': generateUploadUrl,
    };
    vi.mocked(useMutation).mockImplementation(
      ((mutation: unknown) =>
        mutations[getFunctionName(mutation as FunctionReference<'mutation'>)]) as typeof useMutation
    );
    vi.mocked(useQuery).mockImplementation(((query: unknown) => {
      const name = getFunctionName(query as FunctionReference<'query'>);
      if (name === 'events:getMyRegisteredEvents') return events;
      if (name === 'categories:getAllCategories') return CATEGORIES;
      if (name === 'products:getMyProducts') return myProducts;
      return undefined;
    }) as typeof useQuery);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:preview' }));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ storageId: 'img1' }) })
    );
  });

  it('enters rows quickly and saves them for the bazaar', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Kategorie Zeile 1'), {
      target: { value: 'cat-clothes' },
    });
    fireEvent.change(screen.getByLabelText('Titel Zeile 1'), { target: { value: 'Body' } });
    fireEvent.change(screen.getByLabelText('Größe Zeile 1'), { target: { value: '74' } });
    fireEvent.change(screen.getByLabelText('Preis Zeile 1'), { target: { value: '2,50' } });
    fireEvent.keyDown(screen.getByLabelText('Preis Zeile 1'), { key: 'Enter' });

    // The new row takes over category and size, the title gets the focus
    expect(screen.getAllByTestId('quick-row')).toHaveLength(2);
    expect(screen.getByLabelText('Kategorie Zeile 2')).toHaveValue('cat-clothes');
    expect(screen.getByLabelText('Größe Zeile 2')).toHaveValue('74');
    expect(screen.getByLabelText('Titel Zeile 2')).toHaveFocus();

    fireEvent.change(screen.getByLabelText('Titel Zeile 2'), { target: { value: 'Hose' } });
    fireEvent.change(screen.getByLabelText('Preis Zeile 2'), { target: { value: '3' } });
    expect(screen.getByText('2 Artikel · zusammen 5,50 €')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2 Artikel anlegen' }));
    await waitFor(() =>
      expect(addProducts).toHaveBeenCalledWith({
        eventId: 'evt-kids',
        items: [
          {
            title: 'Body',
            productCategory: 'cat-clothes',
            condition: 'good',
            price: 2.5,
            attributes: { size: '74' },
          },
          {
            title: 'Hose',
            productCategory: 'cat-clothes',
            condition: 'good',
            price: 3,
            attributes: { size: '74' },
          },
        ],
      })
    );
    expect(await screen.findByText('2 Artikel angelegt')).toBeInTheDocument();
  });

  it('categories without size have no size field; empty rows are ignored', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Kategorie Zeile 1'), { target: { value: 'cat-toys' } });
    expect(screen.getByLabelText('Größe Zeile 1')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Zeile hinzufügen' }));
    expect(screen.getByRole('button', { name: '0 Artikel anlegen' })).toBeDisabled();
  });

  it('serial capture: each photo becomes a row and is saved with the item', async () => {
    events = [FAHRRADBOERSE];
    renderPage();
    expect(screen.getByText(/braucht jeder Artikel ein Foto/)).toBeInTheDocument();

    const photo = (name: string) => new File(['x'], name, { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Fotos auswählen'), {
      target: { files: [photo('a.jpg'), photo('b.jpg')] },
    });
    // The empty first row takes the first photo, the second photo adds a row
    expect(screen.getAllByTestId('quick-row')).toHaveLength(2);
    expect(screen.getByLabelText('Titel Zeile 1')).toHaveFocus();
    await waitFor(() => expect(generateUploadUrl).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByLabelText('Titel Zeile 1'), { target: { value: 'Kinderrad' } });
    fireEvent.change(screen.getByLabelText('Preis Zeile 1'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Titel Zeile 2'), { target: { value: 'Laufrad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Foto Zeile 2 entfernen' }));
    // A row without photo blocks saving at this bazaar
    expect(screen.getByText(/1 ohne Foto/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zeile 2 löschen' }));

    const saveButton = await screen.findByRole('button', { name: '1 Artikel anlegen' });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);
    await waitFor(() =>
      expect(addProducts).toHaveBeenCalledWith({
        eventId: 'evt-bikes',
        items: [expect.objectContaining({ title: 'Kinderrad', price: 40, images: ['img1'] })],
      })
    );
  });

  it('a failed upload removes the photo again', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    renderPage();
    fireEvent.change(screen.getByLabelText('Foto Zeile 1'), {
      target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(screen.queryByAltText('Foto Zeile 1')).toBeNull());
  });

  it('registers left-over items from earlier bazaars', async () => {
    myProducts = [
      {
        _id: 'old1',
        title: 'Matschhose',
        price: 4,
        images: [],
        sold: false,
        isLocked: false,
        eventIds: ['evt-old'],
        _creationTime: 2,
      },
      {
        _id: 'old2',
        title: 'Body',
        price: 2,
        images: [],
        sold: true,
        isLocked: true,
        eventIds: ['evt-old'],
        _creationTime: 1,
      },
      {
        _id: 'here',
        title: 'Mütze',
        price: 1,
        images: [],
        sold: false,
        isLocked: false,
        eventIds: ['evt-kids'],
        _creationTime: 3,
      },
    ];
    renderPage();
    fireEvent.click(screen.getByText(/1 vorhandene Artikel hier anmelden/));
    fireEvent.click(screen.getByLabelText('Alle auswählen'));
    fireEvent.click(screen.getByRole('button', { name: '1 Artikel für „Kinderbasar“ anmelden' }));
    await waitFor(() =>
      expect(addExisting).toHaveBeenCalledWith({ eventId: 'evt-kids', productIds: ['old1'] })
    );
  });
});
