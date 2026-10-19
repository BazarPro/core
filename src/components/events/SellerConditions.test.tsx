import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SellerConditions } from './SellerConditions';

describe('SellerConditions', () => {
  it('shows fees, a worked example, the rules and the times', () => {
    render(
      <SellerConditions
        event={{
          commission: 10,
          features: { intakeFee: 2, maxItemsPerSeller: 25, priceOffers: true },
          sellerLogistics: { pickupStart: Date.UTC(2026, 9, 17, 14) },
        }}
      />
    );
    expect(screen.getByText(/10 % Provision vom Verkaufspreis/)).toBeInTheDocument();
    expect(screen.getByText(/2,00 € Annahmegebühr pro angenommenem Artikel/)).toBeInTheDocument();
    expect(screen.getByText('Rechenbeispiel')).toBeInTheDocument();
    expect(screen.getByText('Annahmegebühr 10 × 2,00 €')).toBeInTheDocument();
    expect(screen.getByText('−20,00 €')).toBeInTheDocument();
    expect(screen.getByText('Du bekommst')).toBeInTheDocument();
    expect(screen.getByText('7,00 €')).toBeInTheDocument();
    expect(screen.getByText('Bis zu 25 Artikel pro Verkäufer')).toBeInTheDocument();
    expect(screen.getByText(/online Preise vorschlagen/)).toBeInTheDocument();
    expect(screen.getByText('Abholung')).toBeInTheDocument();
  });

  it('says so when there are no fees', () => {
    render(<SellerConditions event={{ commission: 0 }} />);
    expect(screen.getByText(/Keine Gebühren/)).toBeInTheDocument();
    expect(screen.queryByText('Rechenbeispiel')).not.toBeInTheDocument();
  });
});
