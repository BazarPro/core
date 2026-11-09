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
