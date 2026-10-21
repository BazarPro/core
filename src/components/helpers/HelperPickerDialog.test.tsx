import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VendorWithCalculations } from '../../../convex/eventRoles';
import { HelperPickerDialog } from './HelperPickerDialog';

const vendor = (fields: Partial<VendorWithCalculations>) => fields as VendorWithCalculations;
const VENDORS = [
  vendor({ _id: 'owner' as never, name: 'Olga Orga', email: 'olga@test.de' }),
  vendor({ _id: 'anna' as never, name: 'Anna', email: 'anna@test.de', sellerNumber: 3 }),
  vendor({ _id: 'ben' as never, name: 'Ben', email: 'ben@test.de', isHelper: true }),
  vendor({ _id: 'erika' as never, name: 'Erika', managedByEventId: 'evt' as never }),
  vendor({ _id: 'cleo' as never, name: 'Cleo', email: 'cleo@test.de', sellerNumber: 12 }),
];

describe('HelperPickerDialog', () => {
  it('offers participants with an account who are no helper yet', () => {
    const onPick = vi.fn();
    render(
      <HelperPickerDialog
        vendors={VENDORS}
        ownerId="owner"
        open
        onOpenChange={vi.fn()}
        onPick={onPick}
      />
    );
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Cleo')).toBeInTheDocument();
    // Owner, helpers and walk-ins are left out
    for (const name of ['Olga Orga', 'Ben', 'Erika']) {
      expect(screen.queryByText(name)).toBeNull();
    }

    fireEvent.change(screen.getByPlaceholderText('Name, E-Mail oder Nummer'), {
      target: { value: '12' },
    });
    expect(screen.queryByText('Anna')).toBeNull();
    fireEvent.click(screen.getByText('Cleo'));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cleo' }));
  });
});
