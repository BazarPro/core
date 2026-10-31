import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button';
import { PageSkeleton } from './loading';

afterEach(() => {
  vi.useRealTimers();
});

describe('PageSkeleton', () => {
  it('tells screen readers that the page is loading', () => {
    render(<PageSkeleton variant="list" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Wird geladen…');
  });

  it('offers a retry when the server does not answer', () => {
    vi.useFakeTimers();
    render(<PageSkeleton />);
    expect(screen.queryByRole('button', { name: 'Erneut versuchen' })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByText('Der Server antwortet gerade nicht.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });
});

describe('Button loading', () => {
  it('shows a spinner in place of its icon and cannot be clicked twice', () => {
    render(
      <Button loading>
        <svg data-testid="icon" />
        Speichern
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Speichern' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('[data-spinner]')).toBeInTheDocument();
    expect(button.className).toContain('[&>svg:not([data-spinner])]:hidden');
  });
});
