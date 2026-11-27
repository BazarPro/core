import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Id } from '../../../../lib/api/types';
import type { MyProductCardProduct } from './MyProductCard';
import { MyProductFacts } from './MyProductParts';

const product: MyProductCardProduct = {
  _id: 'p1' as Id<'products'>,
  title: 'Roller',
  description: '',
  images: [],
  price: 12,
  productCategory: 'c1' as Id<'categories'>,
  sold: false,
  isLocked: false,
  eventIds: ['e1'],
};

describe('a rejected item in "My items"', () => {
  // Why it was turned down shows on the bazaar's page (MyRejections)
  it('shows the state at the filtered bazaar', () => {
    render(<MyProductFacts product={product} status="rejected" />);
    expect(screen.getByText('Abgelehnt')).toBeVisible();
  });
});

describe('the label of an item', () => {
  it('is missing until printed, then the hint goes', () => {
    const { rerender } = render(<MyProductFacts product={product} status="announced" />);
    expect(screen.getByText('Etikett fehlt')).toBeVisible();
    rerender(<MyProductFacts product={{ ...product, labelPrintedAt: 1 }} status="announced" />);
    expect(screen.queryByText('Etikett fehlt')).toBeNull();
  });

  it('is no topic any more once the item was taken in', () => {
    render(<MyProductFacts product={product} status="available" />);
    expect(screen.queryByText('Etikett fehlt')).toBeNull();
  });
});
