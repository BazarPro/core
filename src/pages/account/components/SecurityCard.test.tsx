import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SecurityCard } from './SecurityCard';

const changePassword = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../../lib/api/react', () => ({
  useAuthActions: () => ({ changePassword }),
}));

describe('SecurityCard', () => {
  it('changes the password with one field and 10 characters, shown on request', async () => {
    render(<SecurityCard providers={['password']} />);
    expect(screen.queryByLabelText('Passwort bestätigen')).toBeNull();

    fireEvent.change(screen.getByLabelText('Aktuelles Passwort'), { target: { value: '123456' } });
    const newPassword = screen.getByLabelText('Neues Passwort setzen');
    fireEvent.change(newPassword, { target: { value: 'kurz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Passwort aktualisieren' }));
    expect(await screen.findByText('Mindestens 10 Zeichen')).toHaveClass('text-destructive');
    expect(changePassword).not.toHaveBeenCalled();

    const [, showNew] = screen.getAllByRole('button', { name: 'Passwort anzeigen' });
    fireEvent.click(showNew);
    expect(newPassword).toHaveAttribute('type', 'text');
    fireEvent.change(newPassword, { target: { value: 'kinderbasar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Passwort aktualisieren' }));
    await waitFor(() => expect(changePassword).toHaveBeenCalledWith('123456', 'kinderbasar'));
  });
});
