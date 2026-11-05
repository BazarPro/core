import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../../lib/api/client';
import { ForgotPasswordForm } from './ForgotPasswordForm';

const signIn = vi.hoisted(() => vi.fn());
vi.mock('../../../../lib/api/react', () => ({ useAuthActions: () => ({ signIn }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const EMAIL = 'erika@example.de';
const apiError = (code: string) => new ApiError(400, { code, message: code });
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submitForm = (control: HTMLElement) => fireEvent.submit(control.closest('form')!);

/** Opens the form as the link in the reset email does. */
function renderFromLink(search = `?resetCode=ABC123&email=${EMAIL}`) {
  window.history.pushState({}, '', `/login${search}`);
  render(<ForgotPasswordForm />);
}

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    signIn.mockReset();
    signIn.mockResolvedValue({ signingIn: false });
    vi.mocked(toast.success).mockClear();
    window.history.pushState({}, '', '/login');
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  describe('asking for a code', () => {
    it('needs an email address', () => {
      render(<ForgotPasswordForm />);
      const button = screen.getByRole('button', { name: 'Code anfordern' });
      expect(button).toBeDisabled();

      submitForm(button);
      expect(screen.getByText('Bitte gib deine E-Mail-Adresse ein.')).toBeInTheDocument();
      expect(signIn).not.toHaveBeenCalled();
    });

    it('moves on to the new password, without saying whether an account exists', async () => {
      render(<ForgotPasswordForm />);
      type('E-Mail-Adresse', EMAIL);
      fireEvent.click(screen.getByRole('button', { name: 'Code anfordern' }));

      expect(await screen.findByRole('heading', { name: 'Passwort neu setzen' })).toBeVisible();
      expect(signIn).toHaveBeenCalledWith('password', {
        email: EMAIL,
        flow: 'reset',
        redirectTo: '/login?mode=reset',
      });
      expect(screen.getByText(/Falls zu dieser E-Mail-Adresse ein Konto/)).toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith('Passwort-Reset angefordert.');
    });

    it('stays on the request when it fails', async () => {
      signIn.mockRejectedValue(new Error('offline'));
      render(<ForgotPasswordForm />);
      type('E-Mail-Adresse', EMAIL);
      fireEvent.click(screen.getByRole('button', { name: 'Code anfordern' }));

      expect(await screen.findByText(/konnte nicht gestartet werden/)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Passwort vergessen?' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Code anfordern' })).toBeEnabled();
    });
  });

  describe('coming from the link in the email', () => {
    it('fills in code and address', () => {
      renderFromLink();
      expect(screen.getByRole('heading', { name: 'Passwort neu setzen' })).toBeInTheDocument();
      expect(screen.getByText(/Reset-Link erkannt/)).toBeInTheDocument();
      expect(screen.getByLabelText('Verifizierungscode')).toHaveValue('ABC123');
      expect(screen.getByText(new RegExp(EMAIL))).toBeInTheDocument();
    });

    it('still asks for a code when the link has only the address', () => {
      renderFromLink(`?email=${EMAIL}`);
      expect(screen.getByRole('heading', { name: 'Passwort vergessen?' })).toBeInTheDocument();
      expect(screen.getByLabelText('E-Mail-Adresse')).toHaveValue(EMAIL);
    });
  });

  describe('setting the new password', () => {
    it('saves code and password', async () => {
      renderFromLink();
      type('Verifizierungscode', 'xyz789');
      expect(screen.getByLabelText('Verifizierungscode')).toHaveValue('XYZ789');
      type('Neues Passwort', 'kinderbasar');
      fireEvent.click(screen.getByRole('button', { name: 'Passwort speichern' }));

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          'Passwort erfolgreich zurückgesetzt. Du bist jetzt angemeldet.'
        )
      );
      expect(signIn).toHaveBeenCalledWith('password', {
        email: EMAIL,
        code: 'XYZ789',
        newPassword: 'kinderbasar',
        flow: 'reset-verification',
      });
    });

    it('asks for all fields', () => {
      renderFromLink();
      submitForm(screen.getByLabelText('Verifizierungscode'));
      expect(screen.getByText('Bitte fülle alle Felder aus.')).toBeInTheDocument();
      expect(signIn).not.toHaveBeenCalled();
    });

    it('turns down a password that is too short and marks the hint', () => {
      renderFromLink();
      type('Neues Passwort', 'kurz');
      expect(screen.getByText('Mindestens 10 Zeichen')).toHaveClass('text-destructive');
      expect(screen.getByRole('button', { name: 'Passwort speichern' })).toBeDisabled();

      submitForm(screen.getByLabelText('Verifizierungscode'));
      expect(screen.getByText(/erfüllt nicht alle Anforderungen/)).toBeInTheDocument();
      expect(signIn).not.toHaveBeenCalled();
    });

    it.each([
      ['INVALID_CODE', /Der Code ist ungültig oder abgelaufen/],
      ['INVALID_PASSWORD', /Der Code ist ungültig oder abgelaufen/],
      ['SOMETHING_ELSE', /Passwort konnte nicht zurückgesetzt werden/],
    ])('explains the backend error %s', async (code, message) => {
      signIn.mockRejectedValue(apiError(code));
      renderFromLink();
      type('Neues Passwort', 'kinderbasar');
      fireEvent.click(screen.getByRole('button', { name: 'Passwort speichern' }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(toast.success).not.toHaveBeenCalled();
    });
  });
});
