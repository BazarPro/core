import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VendorWithCalculations } from '../../../../../../convex/eventRoles';
import { VendorSettlement } from './VendorSettlement';

const NO_FEE = { perItem: 0, items: 0, total: 0 };

function makeVendor(payout: number, paid: boolean, intakeFee = NO_FEE) {
  return {
    _id: 'u1',
    _creationTime: 0,
    name: 'Erika Muster',
    totalRevenue: payout,
    commission: 0,
    payout,
    intakeFee,
    paid,
    grossRevenue: payout,
    totalDiscount: 0,
    isHelper: false,
  } as unknown as VendorWithCalculations;
}

function renderPaid(payout: number) {
  const onUndo = vi.fn().mockResolvedValue(undefined);
  const vendor = makeVendor(payout, true);
  render(
    <VendorSettlement
      vendor={vendor}
      commissionPercent={10}
      itemsToReturn={[]}
      soldCount={1}
      returnedCount={0}
      notHandedInCount={0}
      isSubmitting={false}
      onSettle={vi.fn()}
      onUndo={onUndo}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Abrechnung zurücknehmen' }));
  return { onUndo };
}

const confirmButton = () => screen.getByRole('button', { name: 'Ja, Abrechnung zurücknehmen' });

describe('VendorSettlement: taking the payout back', () => {
  it('asks to take the money back from the seller first', async () => {
    const { onUndo } = renderPaid(45);
    expect(screen.getByText(/ausgezahlten 45,00 € von Erika Muster wieder entgegen/)).toBeTruthy();
    expect(confirmButton()).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByLabelText(/45,00 € von Erika Muster zurückerhalten/));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onUndo).toHaveBeenCalledOnce());
  });

  it('needs no money check when nothing was paid out', async () => {
    const { onUndo } = renderPaid(0);
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onUndo).toHaveBeenCalledOnce());
  });
});

describe('VendorSettlement: intake fee', () => {
  const fee = { perItem: 3, items: 4, total: 12 };
  const renderOpen = (payout: number) =>
    render(
      <VendorSettlement
        vendor={{ ...makeVendor(payout, false, fee), totalRevenue: payout + 12 }}
        commissionPercent={10}
        itemsToReturn={[]}
        soldCount={1}
        returnedCount={3}
        notHandedInCount={0}
        isSubmitting={false}
        onSettle={vi.fn()}
        onUndo={vi.fn()}
      />
    );

  it('is kept from the payout', () => {
    renderOpen(33);
    expect(screen.getByText('Annahmegebühr (4 × 3,00 €)')).toBeTruthy();
    expect(screen.getByText('−12,00 €')).toBeTruthy();
    expect(screen.getByText('Auszahlung')).toBeTruthy();
    expect(screen.getByText('33,00 €')).toBeTruthy();
  });

  it('is paid by the seller when the sales do not cover it', () => {
    renderOpen(-7);
    expect(screen.getByText('Annahmegebühr kassieren')).toBeTruthy();
    expect(screen.getByText('Erika Muster zahlt')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Abrechnung abschließen/ }));
    expect(screen.getByText('7,00 € Annahmegebühr von Erika Muster erhalten')).toBeTruthy();
  });

  it('taking back a settlement where the seller paid returns the money', () => {
    render(
      <VendorSettlement
        vendor={makeVendor(-7, true, fee)}
        commissionPercent={10}
        itemsToReturn={[]}
        soldCount={0}
        returnedCount={4}
        notHandedInCount={0}
        isSubmitting={false}
        onSettle={vi.fn()}
        onUndo={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abrechnung zurücknehmen' }));
    expect(screen.getByText(/erhaltenen 7,00 € an Erika Muster zurück/)).toBeTruthy();
    expect(confirmButton()).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByLabelText('7,00 € an Erika Muster zurückgegeben'));
    expect(confirmButton()).toHaveProperty('disabled', false);
  });
});
