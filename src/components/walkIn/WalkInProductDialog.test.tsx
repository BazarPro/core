import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutation, useQuery } from '../../lib/api/react';
import { type FunctionReference } from 'convex/server';
import { getFunctionName } from '../../lib/api/functions';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { WalkInProductDialog } from './WalkInProductDialog';

vi.mock('../../lib/api/react', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const save = vi.fn();
// Stable like Convex results, so effects depending on them do not loop
const CATEGORIES = [{ _id: 'cat1', label: 'Räder' }];
const PRODUCT = {
  _id: 'prod1',
  title: 'Kinderrad',
  description: 'Rot',
  condition: 'good',
  productCategory: 'cat1',
  price: 40,
  images: ['img1'],
  vendorId: 'erika',
} as unknown as Doc<'products'>;

describe('WalkInProductDialog', () => {
  beforeEach(() => {
    save.mockReset().mockResolvedValue('prod1');
    vi.mocked(useMutation).mockReturnValue(save as unknown as ReturnType<typeof useMutation>);
    vi.mocked(useQuery).mockImplementation(((query: unknown) =>
      getFunctionName(query as FunctionReference<'query'>) === 'categories.getAllCategories'
        ? CATEGORIES
        : undefined) as typeof useQuery);
  });

  // Renders the real ImageUpload: without initial images it once re-rendered in a loop
  it('changes an existing item and keeps its photos without new ones', async () => {
    const onOpenChange = vi.fn();
    render(
      <WalkInProductDialog
        eventId={'evt' as Id<'events'>}
        sellerId={'erika' as Id<'users'>}
        sellerName="Erika"
        product={PRODUCT}
        open
        onOpenChange={onOpenChange}
      />
    );
    expect(screen.getByText('Artikel von Erika bearbeiten')).toBeInTheDocument();
    expect(screen.getByText(/hat 1 Foto/)).toBeInTheDocument();
    // One item at a time when editing
    expect(screen.queryByRole('button', { name: 'Speichern & nächster' })).toBeNull();

    const title = screen.getByLabelText('Produktname *');
    expect(title).toHaveValue('Kinderrad');
    fireEvent.change(title, { target: { value: 'Kinderrad 20 Zoll' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod1',
          title: 'Kinderrad 20 Zoll',
          price: 40,
          images: undefined,
        })
      )
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
