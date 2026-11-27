import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useQuery } from '../../../../lib/api/react';
import { getFunctionName } from '../../../../lib/api/functions';
import { SettingsPage } from './SettingsPage';

vi.mock('../../../../lib/api/react', () => ({
  useQuery: vi.fn(),
  useMutation: () => vi.fn(),
  useApiClient: () => ({}),
  useAuthState: () => ({ isLoading: false, isAuthenticated: true }),
  useConnected: () => true,
}));

const DAY = 24 * 60 * 60 * 1000;

/** A bazaar that ended yesterday: its organizer reads the settings, nothing to change. */
function mockEndedBazaar() {
  const start = Date.now() - 2 * DAY;
  vi.mocked(useQuery).mockImplementation(((ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (name === 'events.getEvent')
      return {
        _id: 'event1',
        title: 'Fahrradbörse',
        location: 'Bürgerhalle',
        startDate: start,
        endDate: start + DAY,
        categories: [],
        categoryLabels: ['Fahrräder'],
        services: [],
        commission: 15,
        visibility: 'public',
        accessCode: '',
        isApproved: true,
        approvalStatus: 'approved',
        features: {},
      };
    if (name === 'eventRoles.getMyRolesForEvent') return ['organizer'];
    if (name === 'eventRoles.getMyPermissionsForEvent') return [];
    if (name === 'users.viewer') return { systemRole: 'user' };
    if (name === 'categories.getAllCategories') return [];
    return undefined;
  }) as typeof useQuery);
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/events/view/:eventId/settings" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('settings of a bazaar that is over', () => {
  it('shows the same tabs as when editing, one part at a time', () => {
    mockEndedBazaar();
    renderAt('/events/view/event1/settings');

    expect(screen.getByRole('tab', { name: 'Termin & Ort' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('Bürgerhalle')).toBeInTheDocument();
    expect(screen.queryByText('15 %')).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Gebühren' }));
    expect(screen.getByText('15 %')).toBeInTheDocument();
    expect(screen.queryByText('Bürgerhalle')).not.toBeInTheDocument();
  });

  it('offers to delete the bazaar only in the first tab', () => {
    mockEndedBazaar();
    renderAt('/events/view/event1/settings?tab=fees');
    expect(screen.queryByRole('button', { name: 'Basar löschen' })).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Termin & Ort' }));
    expect(screen.getByRole('button', { name: 'Basar löschen' })).toBeInTheDocument();
  });
});
