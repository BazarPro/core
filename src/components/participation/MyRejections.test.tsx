import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Id } from '../../lib/api/types';
import { MyRejectionList } from './MyRejections';

describe('items not handed in on the bazaar page', () => {
  it('lists each item that was turned down', () => {
    render(
      <MyRejectionList
        rejections={[
          { productId: 'p1' as Id<'products'>, title: 'Roller', rejectedAt: Date.UTC(2026, 2, 14) },
          { productId: 'p2' as Id<'products'>, title: 'Ball', rejectedAt: Date.UTC(2026, 2, 14) },
        ]}
      />
    );
    expect(screen.getByRole('heading', { name: '2 Artikel nicht abgegeben' })).toBeVisible();
    expect(screen.getByText('Roller')).toBeVisible();
    expect(screen.getByText('Ball')).toBeVisible();
    expect(screen.getByText(/nicht rechtzeitig abgegeben/)).toBeVisible();
  });
});
