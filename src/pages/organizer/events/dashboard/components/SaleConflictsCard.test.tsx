import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import i18n from '../../../../../i18n';
import { getFunctionName } from '../../../../../lib/api/functions';
import { useQuery } from '../../../../../lib/api/react';
import { SaleConflictsCard } from './SaleConflictsCard';

vi.mock('../../../../../lib/api/react', () => ({
  useMutation: vi.fn(() => vi.fn()),
  useQuery: vi.fn(),
}));

const refused = (row: object) => ({
  _id: 'a1',
  name: 'eventProducts.updateProductStatus',
  label: 'Ski',
  error: 'offline.notReplayable',
  errorMessage: 'Gespeicherter Text',
  doneAt: 1_700_000_000_000,
  ...row,
});

function showing(failed: object[], conflicts: object[] = []) {
  vi.mocked(useQuery).mockImplementation(((fn: unknown) =>
    getFunctionName(fn) === 'offline.getFailedActions' ? failed : conflicts) as typeof useQuery);
  return render(<SaleConflictsCard eventId={'evt1' as never} />);
}

const conflict = (row: object) => ({
  _id: 'c1',
  title: 'Ski',
  amount: 20,
  reason: 'product.notForSale',
  soldAt: 1_700_000_000_000,
  paymentMethod: 'cash',
  ...row,
});

describe('SaleConflictsCard', () => {
  it('shows why an offline action was refused in the language of the app', async () => {
    await i18n.changeLanguage('en');
    showing([refused({ errorParams: {} })]);
    expect(
      screen.getByText(/This action cannot be replayed offline\./, { exact: false })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Gespeicherter Text/)).toBeNull();
    await i18n.changeLanguage('de');
  });

  it('names the SumUp payment of a card sale, so the team refunds it there', () => {
    showing(
      [],
      [
        conflict({ _id: 'c1', paymentMethod: 'card', cardTransactionCode: 'TEENSK4W2K' }),
        conflict({ _id: 'c2', title: 'Helm' }),
      ]
    );
    expect(
      screen.getByText(/An einer anderen Kasse schon verkauft · Karte, SumUp TEENSK4W2K/)
    ).toBeInTheDocument();
    // The cash sale names no card
    expect(screen.getAllByText(/ · Karte/)).toHaveLength(1);
  });

  it('shows the stored text of actions refused before the parameters were kept', () => {
    showing([refused({})]);
    expect(screen.getByText(/Gespeicherter Text/)).toBeInTheDocument();
  });
});
