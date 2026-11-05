import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api/client';
import { getFunctionName } from '../../../lib/api/functions';
import type { FunctionReference } from '../../../lib/api/types';
import { LoginPage } from './LoginPage';

const { signIn, state } = vi.hoisted(() => ({
  signIn: vi.fn(),
  state: {
    flags: {} as Record<string, boolean> | undefined,
    redirectAfterLogin: false,
  },
}));

vi.mock('../../../lib/api/react', () => ({
  useAuthState: () => ({ isLoading: false, isAuthenticated: false }),
  useAuthActions: () => ({ signIn }),
  useQuery: (ref: FunctionReference<'query'>) =>
    ({ 'featureFlags.get': state.flags, 'authProviders.configured': {} })[getFunctionName(ref)],
}));
vi.mock('../../../context/UserRoleContext', () => ({ useUserRole: () => ({ role: null }) }));
vi.mock('../../../hooks/useRedirectAfterLogin', () => ({
  useRedirectAfterLogin: () => state.redirectAfterLogin,
  OVERVIEW_PATH: '/overview',
}));
vi.mock('../../../native/ServerSwitch', () => ({ ServerSwitch: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const EMAIL = 'erika@example.de';
const PASSWORD = 'kinderbasar';
const CHECK_INBOX = { name: 'Prüfe dein Postfach' };

const apiError = (code: string) => new ApiError(400, { code, message: code });
const heading = (name: string) => screen.findByRole('heading', { name });

function CurrentPath() {
  const { pathname, search } = useLocation();
  return <output data-testid="path">{`${pathname}${search}`}</output>;
}
const currentPath = () => screen.getByTestId('path').textContent;

function renderAt(url = '/login') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={null} />
      </Routes>
      <CurrentPath />
    </MemoryRouter>
  );
}

function logIn(submitName = 'Anmelden') {
  fireEvent.change(screen.getByLabelText('E-Mail-Adresse'), { target: { value: EMAIL } });
  fireEvent.change(screen.getByLabelText('Passwort'), { target: { value: PASSWORD } });
  fireEvent.click(screen.getByRole('button', { name: submitName }));
}

/** Logs in with an unconfirmed address, which leads to the code form. */
async function reachVerification() {
  signIn.mockResolvedValueOnce({ signingIn: false });
  renderAt();
  logIn();
  await screen.findByRole('heading', CHECK_INBOX);
  signIn.mockClear();
}

function submitCode(code: string) {
  fireEvent.change(screen.getByLabelText('Verifizierungscode'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'E-Mail bestätigen' }));
}

const resend = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Neuen Code anfordern' }));
  await waitFor(() => expect(screen.getByTestId('form-email-verification')).toBeInTheDocument());
};

describe('LoginPage', () => {
  beforeEach(() => {
    signIn.mockReset();
    signIn.mockResolvedValue({ signingIn: true });
    state.flags = {};
    state.redirectAfterLogin = false;
    vi.mocked(toast.success).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('has one way back from "forgot password", which leads to the login form', () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: 'Passwort vergessen?' }));
    expect(screen.getByRole('heading', { name: 'Passwort vergessen?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(screen.getByRole('heading', { name: 'Willkommen zurück' })).toBeInTheDocument();
  });

  it.each(['/login?mode=reset', '/login?resetCode=ABC123'])(
    'opens "forgot password" right away from %s',
    (url) => {
      renderAt(url);
      expect(screen.queryByRole('heading', { name: 'Willkommen zurück' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Zurück' })).toBeInTheDocument();
    }
  );

  it('shows no form while the feature flags load', () => {
    state.flags = undefined;
    renderAt();
    expect(screen.queryByTestId('form-login')).toBeNull();
  });

  describe('once logged in', () => {
    beforeEach(() => {
      state.redirectAfterLogin = true;
    });

    it('goes to the overview', () => {
      renderAt();
      expect(currentPath()).toBe('/overview');
    });

    it('goes back to where the user wanted to go', () => {
      renderAt('/login?redirect=%2Fevents%2F1');
      expect(currentPath()).toBe('/events/1');
    });

    it('does not follow a link to another site', () => {
      renderAt('/login?redirect=https%3A%2F%2Fexample.com');
      expect(currentPath()).toBe('/overview');
    });
  });

  describe('going to the registration', () => {
    const clickRegister = () =>
      fireEvent.click(screen.getByRole('button', { name: 'Jetzt registrieren' }));

    it('opens it', () => {
      renderAt();
      clickRegister();
      expect(currentPath()).toBe('/register');
    });

    it('takes the target along', () => {
      renderAt('/login?redirect=%2Fevents%2F1');
      clickRegister();
      expect(currentPath()).toBe('/register?redirect=%2Fevents%2F1');
    });
  });

  it('closes the form while logging in is switched off', () => {
    state.flags = { is_login_enabled: false };
    renderAt();
    expect(screen.getByText(/Die Anmeldung ist derzeit deaktiviert/)).toBeInTheDocument();
    expect(screen.getByLabelText('E-Mail-Adresse')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Anmelden' })).toBeDisabled();

    fireEvent.submit(screen.getByTestId('form-login'));
    expect(signIn).not.toHaveBeenCalled();
    expect(screen.queryByText('Bitte E-Mail und Passwort eingeben.')).toBeNull();
  });

  it('reports a banned or deleted account coming back from Google or GitHub', async () => {
    renderAt('/login?error=1&oauth=1&redirect=%2Fevents%2F1');
    expect(await screen.findByText(/gesperrt oder gelöscht/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute(
      'href',
      'mailto:support@bazarpro.de'
    );
    expect(currentPath()).toBe('/login?redirect=%2Fevents%2F1');
  });

  describe('logging in', () => {
    it('asks for email and password', () => {
      renderAt();
      fireEvent.submit(screen.getByTestId('form-login'));
      expect(screen.getByText('Bitte E-Mail und Passwort eingeben.')).toBeInTheDocument();
      expect(signIn).not.toHaveBeenCalled();
    });

    it('sends the credentials and stays put when the session starts', async () => {
      renderAt();
      logIn();
      await waitFor(() =>
        expect(signIn).toHaveBeenCalledWith('password', {
          email: EMAIL,
          password: PASSWORD,
          flow: 'signIn',
          redirectTo: '/register',
        })
      );
      await waitFor(() => expect(screen.getByRole('button', { name: 'Anmelden' })).toBeEnabled());
      expect(screen.queryByRole('heading', CHECK_INBOX)).toBeNull();
    });

    it.each([
      ['INVALID_CREDENTIALS', /Ungültige Anmeldedaten/],
      ['TOO_MANY_FAILED_ATTEMPTS', /Zu viele falsche Passwörter/],
      ['SOMETHING_ELSE', /Ein unerwarteter Fehler/],
    ])('explains the backend error %s', async (code, message) => {
      signIn.mockRejectedValue(apiError(code));
      renderAt();
      logIn();
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument();
    });

    it('points a banned account to the support', async () => {
      signIn.mockRejectedValue(apiError('ACCOUNT_BANNED'));
      renderAt();
      logIn();
      expect(await screen.findByText(/Dein Account wurde gesperrt/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute(
        'href',
        'mailto:support@bazarpro.de'
      );
    });
  });

  describe('a deleted account', () => {
    async function reachReactivation() {
      signIn.mockRejectedValueOnce(apiError('ACCOUNT_DELETED'));
      renderAt();
      logIn();
      await screen.findByRole('button', { name: 'Account reaktivieren' });
      signIn.mockClear();
    }

    it('can be brought back', async () => {
      await reachReactivation();
      expect(screen.getByText(/Dein Account wurde gelöscht/)).toBeInTheDocument();

      signIn.mockResolvedValue({ signingIn: false });
      fireEvent.click(screen.getByRole('button', { name: 'Account reaktivieren' }));

      expect(await screen.findByRole('button', { name: 'Anmelden' })).toBeInTheDocument();
      expect(signIn).toHaveBeenCalledWith('password', {
        flow: 'reactivate',
        email: EMAIL,
        password: PASSWORD,
      });
      expect(toast.success).toHaveBeenCalledWith(
        'Account erfolgreich reaktiviert. Du kannst dich jetzt anmelden.'
      );
    });

    it.each([
      ['INVALID_CREDENTIALS', /Ungültige Anmeldedaten/],
      ['TOO_MANY_FAILED_ATTEMPTS', /Zu viele falsche Passwörter/],
      ['SOMETHING_ELSE', /konnte nicht reaktiviert werden/],
    ])('explains the backend error %s and offers it again', async (code, message) => {
      await reachReactivation();
      signIn.mockRejectedValue(apiError(code));
      fireEvent.click(screen.getByRole('button', { name: 'Account reaktivieren' }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Account reaktivieren' })).toBeInTheDocument();
    });
  });

  describe('confirming the email address', () => {
    it('asks for the code of an unconfirmed address', async () => {
      await reachVerification();
      expect(screen.getByText(EMAIL)).toBeInTheDocument();
      expect(screen.getByTestId('email-verification-info')).toHaveTextContent(
        'Bitte bestätige deine E-Mail-Adresse.'
      );
      expect(toast.success).toHaveBeenCalledWith(
        'Anmeldung gestartet. Bitte bestätige jetzt deine E-Mail-Adresse.'
      );
      expect(screen.queryByTestId('form-login')).toBeNull();
    });

    it('needs a code', async () => {
      await reachVerification();
      fireEvent.submit(screen.getByTestId('form-email-verification'));
      expect(screen.getByText('Bitte gib den Verifizierungscode ein.')).toBeInTheDocument();
      expect(signIn).not.toHaveBeenCalled();
    });

    it('sends the code in capitals', async () => {
      await reachVerification();
      signIn.mockResolvedValue({ signingIn: true });
      submitCode('abc123');
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          'E-Mail erfolgreich bestätigt. Du wirst jetzt angemeldet.'
        )
      );
      expect(signIn).toHaveBeenCalledWith('password', {
        email: EMAIL,
        code: 'ABC123',
        flow: 'email-verification',
      });
    });

    it.each([
      ['INVALID_CODE', /Der Code ist ungültig oder abgelaufen/],
      ['SOMETHING_ELSE', /Ein unerwarteter Fehler/],
    ])('stays on the code form with the backend error %s', async (code, message) => {
      await reachVerification();
      signIn.mockRejectedValue(apiError(code));
      submitCode('ABC123');
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByRole('heading', CHECK_INBOX)).toBeInTheDocument();
    });

    it('offers the reactivation when the account turns out to be deleted', async () => {
      await reachVerification();
      signIn.mockRejectedValue(apiError('ACCOUNT_DELETED'));
      submitCode('ABC123');
      expect(await screen.findByRole('button', { name: 'Account reaktivieren' })).toBeVisible();
      expect(screen.queryByRole('heading', CHECK_INBOX)).toBeNull();
    });

    it('returns to the login when the account turns out to be banned', async () => {
      await reachVerification();
      signIn.mockRejectedValue(apiError('ACCOUNT_BANNED'));
      submitCode('ABC123');
      expect(await heading('Willkommen zurück')).toBeInTheDocument();
      expect(screen.getByText(/Dein Account wurde gesperrt/)).toBeInTheDocument();
    });
  });

  describe('asking for a new code', () => {
    it('sends one to the same address', async () => {
      await reachVerification();
      await resend();
      expect(signIn).toHaveBeenCalledWith('password', {
        email: EMAIL,
        flow: 'email-verification',
        redirectTo: '/register',
      });
      expect(await screen.findByTestId('email-verification-info')).toHaveTextContent(
        'Wir haben einen neuen Verifizierungscode an deine E-Mail-Adresse gesendet.'
      );
      expect(screen.queryByTestId('alert-wrong-login')).toBeNull();
    });

    it('says when that fails, and no longer that it worked', async () => {
      await reachVerification();
      await resend();
      await screen.findByText(/neuen Verifizierungscode/);

      signIn.mockRejectedValue(new Error('offline'));
      fireEvent.click(screen.getByRole('button', { name: 'Neuen Code anfordern' }));
      expect(await screen.findByText(/konnte nicht erneut gesendet werden/)).toBeInTheDocument();
      expect(screen.queryByTestId('email-verification-info')).toBeNull();
    });

    async function resendThreeTimes() {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Neuen Code anfordern' }));
        });
      }
    }

    it('blocks a fourth time for 15 minutes, then allows it again', async () => {
      await reachVerification();
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
      await resendThreeTimes();
      expect(screen.getByText(/15 Minuten gesperrt/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Code erneut senden in \d+ s/ })).toBeDisabled();

      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.getByRole('button', { name: /Code erneut senden in 840 s/ })).toBeDisabled();

      act(() => {
        vi.advanceTimersByTime(14 * 60_000);
      });
      expect(screen.getByRole('button', { name: 'Neuen Code anfordern' })).toBeEnabled();
    });
  });
});
