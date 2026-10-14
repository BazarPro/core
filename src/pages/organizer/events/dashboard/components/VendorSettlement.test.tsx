import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VendorWithCalculations } from '../../../../../../convex/eventRoles';
import { VendorSettlement } from './VendorSettlement';

function renderPaid(payout: number) {
  const onUndo = vi.fn().mockResolvedValue(undefined);
  const vendor = {
    _id: 'u1',
    _creationTime: 0,
    name: 'Erika Muster',
    totalRevenue: payout,
    commission: 0,
    payout,
    paid: true,
    grossRevenue: payout,
    totalDiscount: 0,
    isHelper: false,
  } as unknown as VendorWithCalculations;
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
