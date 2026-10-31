import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuery } from '../../../../lib/api/react';
import { getFunctionName } from '../../../../lib/api/functions';
import type { Id } from '../../../../lib/api/types';
import { PublicProductOrganizerActions } from './PublicProductOrganizerActions';
import { PublicProductVendorCard } from './PublicProductVendorCard';

vi.mock('../../../../lib/api/react', () => ({
  useQuery: vi.fn(),
  useMutation: () => vi.fn(),
  useApiClient: () => ({}),
  useConnected: () => true,
}));

const EVENT_ID = 'event1' as Id<'events'>;
const PRODUCT_ID = 'product1' as Id<'products'>;

function Location() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderActions() {
  render(
    <MemoryRouter initialEntries={[`/products/view/${PRODUCT_ID}`]}>
      <Routes>
        <Route
          path="/products/view/:id"
          element={<PublicProductOrganizerActions productId={PRODUCT_ID} eventId={EVENT_ID} />}
        />
        <Route path="*" element={<Location />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PublicProductOrganizerActions', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockImplementation(((ref: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(ref);
      if (name === 'eventRoles.getMyRolesForEvent') return ['organizer'];
      if (name === 'eventProducts.getEventProduct')
        return {
          _id: 'ep1',
          status: 'available',
          internalNote: 'Haken 12',
          vendor: {
            _id: 'vendor1',
            firstName: 'Erika',
            lastName: 'Muster',
            phone: '0151 123',
            email: 'erika@example.com',
          },
        };
      return undefined;
    }) as typeof useQuery);
  });

  it('shows the seller once, with phone, email and the internal note', () => {
    renderActions();
    expect(screen.getAllByText('Erika Muster')).toHaveLength(1);
    expect(screen.getByRole('link', { name: '0151 123' })).toHaveAttribute('href', 'tel:0151 123');
    expect(screen.getByRole('link', { name: 'erika@example.com' })).toHaveAttribute(
      'href',
      'mailto:erika@example.com'
    );
    expect(screen.getByLabelText('Interne Notiz')).toHaveValue('Haken 12');
  });

  it('links the seller name to the seller view of the event', () => {
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /Erika Muster/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/events/view/${EVENT_ID}/products?vendor=vendor1`
    );
  });

  it('renders nothing for users who cannot manage the event', () => {
    vi.mocked(useQuery).mockReturnValue([]);
    renderActions();
    expect(screen.queryByText('Veranstalter-Verwaltung')).not.toBeInTheDocument();
  });
});

describe('PublicProductVendorCard', () => {
  it('lists the event but no seller (the organizer box shows the seller)', () => {
    render(
      <MemoryRouter>
        <PublicProductVendorCard
          events={[
            {
              _id: EVENT_ID,
              _creationTime: 0,
              title: 'Fahrradbörse',
              location: 'Bürgerhalle',
              startDate: 0,
              endDate: 0,
            } as never,
          ]}
          productId={PRODUCT_ID}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Fahrradbörse')).toBeInTheDocument();
    expect(screen.queryByText(/Verkäufer/)).not.toBeInTheDocument();
  });
});
