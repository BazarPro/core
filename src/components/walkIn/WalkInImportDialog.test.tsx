import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutation, useQuery } from '../../lib/api/react';
import { type FunctionReference } from '../../lib/api/types';
import { getFunctionName } from '../../lib/api/functions';
import type { Id } from '../../lib/api/types';
import { WalkInImportDialog } from './WalkInImportDialog';

vi.mock('../../lib/api/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const importProducts = vi.fn();
const CATEGORIES = [
  { _id: 'shoes', label: 'Skischuhe' },
  { _id: 'helmets', label: 'Helme' },
];

describe('WalkInImportDialog', () => {
  beforeEach(() => {
    importProducts.mockReset().mockResolvedValue(1);
    vi.mocked(useMutation).mockReturnValue(
      importProducts as unknown as ReturnType<typeof useMutation>
    );
    vi.mocked(useQuery).mockImplementation(((query: unknown) =>
      getFunctionName(query as FunctionReference<'query'>) === 'categories.getAllCategories'
        ? CATEGORIES
        : undefined) as typeof useQuery);
  });

  it('imports the example list of a shop with a category for the whole file', async () => {
    const onOpenChange = vi.fn();
    render(
      <WalkInImportDialog
        eventId={'evt' as Id<'events'>}
        sellerId={'shop' as Id<'users'>}
        sellerName="Sport Huber"
        open
        onOpenChange={onOpenChange}
      />
    );
    const file = new File(
      ['﻿Artikel;Farbe;Preis;Groesse\r\nSkisch. D Neu;schwarz;145;39\r\nX;;1;\r\n'],
      'Import.csv',
      { type: 'text/csv' }
    );
    fireEvent.change(screen.getByLabelText('CSV-Datei'), { target: { files: [file] } });

    // Without a category nothing is ready yet
    expect(await screen.findByText('0 Artikel bereit')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'shoes' } });
    expect(screen.getByText('1 Artikel bereit')).toBeInTheDocument();
    expect(
      screen.getByText('Zeile 3: Titel fehlt oder ist kürzer als 3 Zeichen')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '1 Artikel importieren' }));
    await waitFor(() =>
      expect(importProducts).toHaveBeenCalledWith({
        eventId: 'evt',
        sellerId: 'shop',
        items: [
          {
            title: 'Skisch. D Neu',
            description: 'Farbe: schwarz',
            condition: 'new',
            productCategory: 'shoes',
            price: 145,
            attributes: { size: '39' },
          },
        ],
      })
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
