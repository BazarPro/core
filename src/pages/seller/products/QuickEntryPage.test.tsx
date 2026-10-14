import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutation, useQuery } from 'convex/react';
import { getFunctionName, type FunctionReference } from 'convex/server';
import { QuickEntryPage } from './QuickEntryPage';

vi.mock('convex/react', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../../lib/productQRCodePdf', () => ({ downloadProductQRCodesPdf: vi.fn() }));
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
let events: object[] = [KINDERBASAR];

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
    vi.mocked(useMutation).mockReturnValue(
      addProducts as unknown as ReturnType<typeof useMutation>
    );
    vi.mocked(useQuery).mockImplementation(((query: unknown) => {
      const name = getFunctionName(query as FunctionReference<'query'>);
      if (name === 'events:getMyRegisteredEvents') return events;
      if (name === 'categories:getAllCategories') return CATEGORIES;
      return undefined;
    }) as typeof useQuery);
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

  it('a bazaar that requires photos points to the normal product form', () => {
    events = [FAHRRADBOERSE];
    renderPage();
    expect(screen.getByText(/braucht jeder Artikel ein Foto/)).toBeInTheDocument();
    expect(screen.queryByTestId('quick-row')).toBeNull();
  });
});
