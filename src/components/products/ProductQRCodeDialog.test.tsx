import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { Id } from '../../lib/api/types';
import { downloadLabelsPdf } from '../../lib/productQRCodePdf';
import { ProductQRCodeDialog } from './ProductQRCodeDialog';

const client = vi.hoisted(() => ({}));
vi.mock('../../lib/api/react', () => ({ useApiClient: () => client }));
vi.mock('../../lib/productQRCodePdf', () => ({ downloadLabelsPdf: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const id = '0199f2a4-7c1e-7b3a-9d2e-5f6a7b8c9d0e' as Id<'products'>;

function renderDialog() {
  render(<ProductQRCodeDialog open onOpenChange={() => {}} productId={id} productTitle="Body" />);
}

describe('ProductQRCodeDialog', () => {
  it('prints the label of the item for its next bazaar', async () => {
    vi.mocked(downloadLabelsPdf).mockResolvedValue(1);
    renderDialog();
    expect(screen.getByText(new RegExp(`/products/view/${id}$`))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Etikett als PDF' }));
    // Without a bazaar: the backend takes the item's current or next one
    await waitFor(() => expect(downloadLabelsPdf).toHaveBeenCalledWith(client, [id]));
  });

  it('shows why the label could not be made', async () => {
    vi.mocked(downloadLabelsPdf).mockRejectedValue(new Error('offline'));
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Etikett als PDF' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Etikett als PDF' })).toBeEnabled();
  });
});
