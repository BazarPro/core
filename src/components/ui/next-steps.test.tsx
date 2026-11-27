import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Megaphone, ShoppingCart, Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { NextSteps, type NextStep } from './next-steps';
import { keepFirstCurrent } from '../../lib/nextSteps';

const steps: NextStep[] = [
  {
    id: 'done',
    icon: Megaphone,
    title: 'Werbung machen',
    text: 'erledigt',
    to: '/promo',
    done: true,
  },
  {
    id: 'now',
    icon: Users,
    title: 'Verkäufer anmelden',
    to: '/sellers',
    state: { a: 1 },
    current: true,
  },
  { id: 'later', icon: ShoppingCart, title: 'Verkaufen' },
];

describe('NextSteps', () => {
  it('lists the steps, links those with a page and marks the one due now', () => {
    render(
      <MemoryRouter>
        <NextSteps title="So läuft dein Basar" steps={steps} />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'So läuft dein Basar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Werbung machen/ })).toHaveAttribute('href', '/promo');
    expect(screen.getByText('erledigt')).toBeInTheDocument();
    // A step without a page is no link
    expect(screen.queryByRole('link', { name: /Verkaufen/ })).toBeNull();
    expect(screen.getByText('Verkaufen')).toBeInTheDocument();
    const current = screen.getByText('Verkäufer anmelden').closest('li');
    expect(current).toHaveAttribute('aria-current', 'step');
  });
});

describe('keepFirstCurrent', () => {
  it('leaves only the first step due now, e.g. promotion before the intake', () => {
    const due: NextStep[] = [
      { id: 'promote', icon: Megaphone, title: 'Werbung machen', current: true },
      { id: 'sellers', icon: Users, title: 'Verkäufer', done: true },
      { id: 'intake', icon: Users, title: 'Artikel annehmen', current: true },
    ];
    expect(keepFirstCurrent(due)?.id).toBe('promote');
    expect(due.filter((step) => step.current).map((step) => step.id)).toEqual(['promote']);
    expect(keepFirstCurrent([{ id: 'x', icon: Users, title: 'X' }])).toBeUndefined();
  });
});
