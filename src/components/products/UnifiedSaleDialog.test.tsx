import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuery } from '../../lib/api/react';
import type { Id } from '../../lib/api/types';
import { UnifiedSaleDialog } from './UnifiedSaleDialog';

vi.mock('../../lib/api/react', () => ({ useQuery: vi.fn() }));

const OFFER_ID = 'offer1' as Id<'productOffers'>;

function renderDialog(props: Partial<Parameters<typeof UnifiedSaleDialog>[0]> = {}) {
  const onConfirmSale = vi.fn().mockResolvedValue(true);
  render(
    <UnifiedSaleDialog
      open
      onOpenChange={() => {}}
      productTitle="Trekkingrad"
      price={200}
      onConfirmSale={onConfirmSale}
      onDownloadInvoice={vi.fn()}
      isSubmitting={false}
      {...props}
    />
  );
  return { onConfirmSale };
}

const confirmPayment = () => fireEvent.click(screen.getByLabelText(/erhalten/));
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Verkauf abschließen' }));

describe('UnifiedSaleDialog', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue([
      { _id: OFFER_ID, amount: 150, buyerName: 'Max Muster', status: 'accepted' },
    ]);
  });

  it('sells at the label price without price options', async () => {
    vi.mocked(useQuery).mockReturnValue(undefined);
    const { onConfirmSale } = renderDialog({ discountPercent: 10 });
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByText('180,00 €', { selector: 'span.text-2xl' })).toBeInTheDocument();
    confirmPayment();
    submit();
    await waitFor(() =>
      expect(onConfirmSale).toHaveBeenCalledWith({
        offerId: undefined,
        negotiatedPrice: undefined,
        buyerEmail: undefined,
        finalPrice: 180,
      })
    );
  });

  it('redeems an accepted offer', async () => {
    const { onConfirmSale } = renderDialog({ eventProductId: 'ep1' as Id<'eventProducts'> });
    fireEvent.click(screen.getByRole('radio', { name: /Max Muster/ }));
    confirmPayment();
    submit();
    await waitFor(() =>
      expect(onConfirmSale).toHaveBeenCalledWith(
        expect.objectContaining({ offerId: OFFER_ID, finalPrice: 150 })
      )
    );
  });

  it('only accepts negotiated prices between minimum and label price', async () => {
    const { onConfirmSale } = renderDialog({ minimumPrice: 120 });
    fireEvent.click(screen.getByRole('radio', { name: /Verhandelt/ }));
    const input = screen.getByLabelText('Verhandelter Preis');

    fireEvent.change(input, { target: { value: '100' } });
    expect(screen.getByText(/Erlaubt sind 120,00 € bis 200,00 €/)).toBeInTheDocument();
    confirmPayment();
    expect(screen.getByRole('button', { name: 'Verkauf abschließen' })).toBeDisabled();

    fireEvent.change(input, { target: { value: '130,50' } });
    // Changing the price resets the payment confirmation
    expect(screen.getByLabelText(/erhalten/)).not.toBeChecked();
    confirmPayment();
    submit();
    await waitFor(() =>
      expect(onConfirmSale).toHaveBeenCalledWith(
        expect.objectContaining({ negotiatedPrice: 130.5, finalPrice: 130.5 })
      )
    );
  });

  it('validates the optional receipt email', async () => {
    const { onConfirmSale } = renderDialog();
    const email = screen.getByLabelText(/Beleg per E-Mail/);
    fireEvent.change(email, { target: { value: 'kein-mail' } });
    confirmPayment();
    expect(screen.getByText(/gültige E-Mail-Adresse/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verkauf abschließen' })).toBeDisabled();

    fireEvent.change(email, { target: { value: ' kaeufer@example.com ' } });
    submit();
    await waitFor(() =>
      expect(onConfirmSale).toHaveBeenCalledWith(
        expect.objectContaining({ buyerEmail: 'kaeufer@example.com' })
      )
    );
  });

  it('does not load offers without an event item', () => {
    vi.mocked(useQuery).mockReturnValue(undefined);
    renderDialog();
    expect(useQuery).toHaveBeenCalledWith(expect.anything(), 'skip');
  });
});
