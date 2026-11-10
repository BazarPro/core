import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HelperPermissionsFields } from './HelperPermissionsFields';

describe('HelperPermissionsFields', () => {
  it('shows the chosen permissions and keeps their order when one is added', () => {
    const onChange = vi.fn();
    render(<HelperPermissionsFields value={['payout', 'intake']} onChange={onChange} />);
    expect(screen.getByRole('checkbox', { name: /Warenannahme/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Kasse:/ })).not.toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: /Kasse:/ }));
    expect(onChange).toHaveBeenLastCalledWith(['intake', 'sale', 'payout']);

    fireEvent.click(screen.getByRole('checkbox', { name: /Warenannahme/ }));
    expect(onChange).toHaveBeenLastCalledWith(['payout']);
  });
});
