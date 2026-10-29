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

function showing(failed: object[]) {
  vi.mocked(useQuery).mockImplementation(((fn: unknown) =>
    getFunctionName(fn) === 'offline.getFailedActions' ? failed : []) as typeof useQuery);
  return render(<SaleConflictsCard eventId={'evt1' as never} />);
}

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

  it('shows the stored text of actions refused before the parameters were kept', () => {
    showing([refused({})]);
    expect(screen.getByText(/Gespeicherter Text/)).toBeInTheDocument();
  });
});
