import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Id } from '../../lib/api/types';
import { MyRejectionList } from './MyRejections';

describe('rejected items on the bazaar page', () => {
  it('lists each item with its reason, or says there is none', () => {
    render(
      <MyRejectionList
        rejections={[
          {
            productId: 'p1' as Id<'products'>,
            title: 'Roller',
            reason: 'Defekt',
            rejectedAt: Date.UTC(2026, 2, 14),
          },
          {
            productId: 'p2' as Id<'products'>,
            title: 'Ball',
            rejectedAt: Date.UTC(2026, 2, 14),
          },
        ]}
      />
    );
    expect(screen.getByRole('heading', { name: '2 abgelehnte Artikel' })).toBeVisible();
    expect(screen.getByText('Roller')).toBeVisible();
    expect(screen.getByText('Defekt')).toBeVisible();
    expect(screen.getByText('Ohne Begründung')).toBeVisible();
  });
});
