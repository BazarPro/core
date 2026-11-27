import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConditionFacts, SellerConditions } from './SellerConditions';

// The extra fields admins defined, for the names of required ones
vi.mock('../../lib/api/react', () => ({
  useQuery: () => [
    {
      _id: 'frameNumber',
      key: 'frameNumber',
      label: 'Rahmennummer',
      short: false,
      notFoundButton: true,
    },
  ],
}));

describe('SellerConditions', () => {
  it('shows fees, a worked example, the times, then duties and options', () => {
    const { container } = render(
      <SellerConditions
        event={{
          commission: 10,
          features: {
            intakeFee: 2,
            maxItemsPerSeller: 25,
            priceOffers: true,
            eventType: 'bikeExchange',
          },
          sellerLogistics: { pickupStart: Date.UTC(2026, 9, 17, 14) },
        }}
      />
    );
    expect(screen.getByText(/10 % Provision auf jeden verkauften Artikel/)).toBeInTheDocument();
    expect(screen.getByText(/2,00 € Annahmegebühr pro angenommenem Artikel/)).toBeInTheDocument();
    expect(screen.getByText('Rechenbeispiel')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Gibst du 2 Räder ab und verkaufst davon ein Rad für 150,00 €, bekommst du 131,00 € ' +
          '(150,00 € − 15,00 € Provision − 4,00 € Annahmegebühr).'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Bis zu 25 Artikel pro Verkäufer')).toBeInTheDocument();
    expect(screen.getByText(/online Preise vorschlagen/)).toBeInTheDocument();
    expect(screen.getByText('Abholung')).toBeInTheDocument();
    // Fees, times, what applies, what is possible
    expect([...container.querySelectorAll('h4')].map((h) => h.textContent)).toEqual([
      'Gebühren',
      'Abgabe & Abholung',
      'Das gilt für dich',
      'Das ist möglich',
    ]);
  });

  it('leaves out the example when compact, and never names what is not offered', () => {
    render(
      <SellerConditions
        compact
        event={{ commission: 10, features: { discounts: false, priceOffers: true } }}
      />
    );
    expect(screen.getByText(/10 % Provision/)).toBeInTheDocument();
    expect(screen.queryByText('Rechenbeispiel')).not.toBeInTheDocument();
    // Compact: the rules are folded behind one button
    expect(screen.queryByText(/online Preise vorschlagen/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Alle Bedingungen anzeigen/ }));
    expect(screen.queryByText(/Keine Rabatte|Kein Verhandeln/)).not.toBeInTheDocument();
    expect(screen.getByText(/online Preise vorschlagen/)).toBeInTheDocument();
  });

  it('sums the conditions up as chips', () => {
    render(
      <ConditionFacts
        event={{ commission: 15, features: { intakeFee: 0.5, maxItemsPerSeller: 40 } }}
      />
    );
    expect(screen.getByText('15 % Provision')).toBeInTheDocument();
    expect(screen.getByText('0,50 € pro Artikel')).toBeInTheDocument();
    expect(screen.getByText('bis 40 Artikel')).toBeInTheDocument();
  });

  it('names required details, ID, private sellers and late questions, details on request', () => {
    render(
      <SellerConditions
        event={{
          commission: 20,
          features: {
            requiredFields: ['frameNumber'],
            privateSellersOnly: true,
            fixedSellerData: true,
            questions: true,
            questionsDuringEventOnly: true,
          },
        }}
      />
    );
    expect(screen.getByText('Pflichtangaben je Artikel: Rahmennummer')).toBeInTheDocument();
    expect(screen.getByText(/Nur für Privatleute/)).toBeInTheDocument();
    expect(screen.getByText(/Ausweis mitbringen/)).toBeInTheDocument();
    expect(screen.getByText('Mehr dazu').closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText(/Käufer können während des Basars/)).toBeInTheDocument();
  });

  it('says so when there are no fees', () => {
    render(<SellerConditions event={{ commission: 0, features: { discounts: false } }} />);
    expect(screen.getByText(/Keine Gebühren/)).toBeInTheDocument();
    expect(screen.queryByText('Rechenbeispiel')).not.toBeInTheDocument();
    expect(screen.queryByText('Das ist möglich')).not.toBeInTheDocument();
  });
});
