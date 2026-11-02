import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EventTypePicker } from './EventTypePicker';

describe('EventTypePicker', () => {
  it('offers every event type and marks the chosen one', () => {
    const onPick = vi.fn();
    render(<EventTypePicker selected="kidsBazaar" onPick={onPick} onCopy={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Skibasar/ }));
    expect(onPick).toHaveBeenCalledWith('skiBazaar');
    expect(screen.getByRole('button', { name: /^Kinderbasar/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // Without past events there is nothing to copy
    expect(screen.queryByText('Daten übernehmen')).not.toBeInTheDocument();
  });
});
