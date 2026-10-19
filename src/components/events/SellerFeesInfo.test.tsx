import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SellerFeesInfo } from './SellerFeesInfo';

describe('SellerFeesInfo', () => {
  it('lists the fees with an example', () => {
    render(<SellerFeesInfo fees={{ commission: 10, intakeFee: 2 }} />);
    expect(screen.getByText(/10 % Provision/)).toBeInTheDocument();
    expect(screen.getByText(/2,00 € Annahmegebühr pro angenommenem Artikel/)).toBeInTheDocument();
    expect(screen.getByText(/^Beispiel: 10 Artikel abgegeben/)).toBeInTheDocument();
  });

  it('says so when there are no fees', () => {
    render(<SellerFeesInfo fees={{ commission: 0 }} />);
    expect(screen.getByText(/Keine Gebühren/)).toBeInTheDocument();
  });
});
