import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { BackButton } from '../../../components/navigation/BackButton';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Label } from '@radix-ui/react-label';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { useFeatureFlags } from '../../../hooks/useFeatureFlags';
import { useRedirectAfterLogin, BROWSE_EVENTS_PATH } from '../../../hooks/useRedirectAfterLogin';
import { useEffect } from 'react';
import { EmailVerificationForm } from './components/EmailVerificationForm';
import { ForgotPasswordForm } from './components/ForgotPasswordForm';
import { extractConvexErrorMessage } from '../../../lib/errors';
import { toast } from 'sonner';
import { api } from '../../../../convex/_generated/api';

const MAX_RESEND_ATTEMPTS = 3;
const RESEND_COOLDOWN_MS = 15 * 60 * 1000;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState<string | React.ReactNode>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendAttempts, setResendAttempts] = useState(0);
  const [resendBlockedUntil, setResendBlockedUntil] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(Date.now());
  const { signIn } = useAuthActions();
  const [showReactivation, setShowReactivation] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const user = useQuery(api.users.getUserByEmail, { email: email });
  const userStatus = user?.status;
  const setUserStatus = useMutation(api.users.setUserStatus);

  const { isLoading } = useConvexAuth();
  const { isLoginEnabled, isLoading: isFlagsLoading } = useFeatureFlags();
  const redirectAfterLogin = useRedirectAfterLogin();
  const resendRemainingSeconds =
    resendBlockedUntil && resendBlockedUntil > nowTs
      ? Math.ceil((resendBlockedUntil - nowTs) / 1000)
      : 0;
  const isResendBlocked = resendRemainingSeconds > 0;

  useEffect(() => {
    if (!resendBlockedUntil) return;
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [resendBlockedUntil]);

  useEffect(() => {
    if (!resendBlockedUntil) return;
    if (Date.now() >= resendBlockedUntil) {
      setResendBlockedUntil(null);
      setResendAttempts(0);
    }
  }, [nowTs, resendBlockedUntil]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const mode = params.get('mode');
    const hasResetCode = Boolean(params.get('resetCode'));
    if (mode === 'reset' || hasResetCode) {
      setShowForgotPassword(true);
    }
  }, [location.search]);

  useEffect(() => {
    if (searchParams.get('error') === '1') {
      setError(
        <span>
          Dein Account wurde gesperrt oder gelöscht. Bitte wende dich an den{' '}
          <a href="mailto:support@bazarpro.de" className="underline hover:text-primary">
            Support
          </a>{' '}
          für weitere Informationen.
        </span>
      );
      searchParams.delete('error');
      searchParams.delete('oauth');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (user && showReactivation) {
      setUserStatus({ userId: user._id, status: 'active' });
      toast.success('Account erfolgreich reaktiviert. Du kannst dich jetzt anmelden.');
      setShowReactivation(false);
      return;
    }

    if (!isLoginEnabled) return;

    if (!email || !password) {
      setError('Bitte E-Mail und Passwort eingeben.');
      return;
    }

    if (user && userStatus === 'deleted') {
      setError(
        'Dein Account wurde gelöscht. Du kannst deinen Account durch den Button unten reaktivieren. Nach Reaktivierung musst du deine Email-Adresse erneut verifizieren.'
      );
      setShowReactivation(true);
      return;
    }

    setIsSubmitting(true);
    signIn('password', { email, password, flow: 'signIn', redirectTo: '/register' })
      .then(({ signingIn }) => {
        if (!signingIn) {
          setVerificationEmail(email);
          setInfo(
            'Bitte bestätige deine E-Mail-Adresse. Du kannst den Code eingeben oder direkt auf den Link in der Mail klicken.'
          );
          toast.success('Anmeldung gestartet. Bitte bestätige jetzt deine E-Mail-Adresse.');
        }
      })
      .catch((err) => {
        const message = extractConvexErrorMessage(err);
        const normalized = message.toLowerCase();
        if (normalized.includes('deleted')) {
          setError(
            'Dein Account wurde gelöscht. Du kannst deinen Account durch den Button unten reaktivieren. Nach Reaktivierung musst du deine Email-Adresse erneut verifizieren.'
          );
          setShowReactivation(true);
        } else if (normalized.includes('banned')) {
          setError(
            <span>
              Dein Account wurde gesperrt. Bitte wende dich an den{' '}
              <a href="mailto:support@bazarpro.de" className="underline hover:text-primary">
                Support
              </a>{' '}
              für weitere Informationen.
            </span>
          );
        } else {
          setError(
            message.includes('Invalid')
              ? 'Ungültige Anmeldedaten. Bitte versuche es erneut.'
              : 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später erneut.'
          );
        }
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (!verificationEmail || !verificationCode) {
      setError('Bitte gib den Verifizierungscode ein.');
      return;
    }

    setIsVerifying(true);
    signIn('password', {
      email: verificationEmail,
      code: verificationCode,
      flow: 'email-verification',
    })
      .then(() => {
        toast.success('E-Mail erfolgreich bestätigt. Du wirst jetzt angemeldet.');
      })
      .catch((err) => {
        const message = extractConvexErrorMessage(err);
        const normalized = message.toLowerCase();
        if (normalized.includes('deleted')) {
          setError(
            'Dein Account wurde gelöscht. Du kannst deinen Account durch den Button unten reaktivieren. Nach Reaktivierung musst du deine Email-Adresse erneut verifizieren.'
          );
          setShowReactivation(true);
          setVerificationEmail(null);
        } else if (normalized.includes('banned')) {
          setError(
            <span>
              Dein Account wurde gesperrt. Bitte wende dich an den{' '}
              <a href="mailto:support@bazarpro.de" className="underline hover:text-primary">
                Support
              </a>{' '}
              für weitere Informationen.
            </span>
          );
          setVerificationEmail(null);
        } else {
          setError(
            message.includes('Invalid') || message.includes('verify')
              ? 'Der Code ist ungültig oder abgelaufen. Bitte fordere einen neuen Code an.'
              : 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später erneut.'
          );
        }
      })
      .finally(() => {
        setIsVerifying(false);
      });
  };

  const resendVerificationCode = async () => {
    if (!verificationEmail) return;
    if (isResendBlocked) {
      setError(
        `Zu viele Anfragen. Bitte warte ${Math.ceil(resendRemainingSeconds / 60)} Minuten, bevor du erneut sendest.`
      );
      return;
    }

    setError('');
    setIsResending(true);
    signIn('password', {
      email: verificationEmail,
      flow: 'email-verification',
      redirectTo: '/register',
    })
      .then(() => {
        const nextAttempts = resendAttempts + 1;
        setResendAttempts(nextAttempts);
        if (nextAttempts >= MAX_RESEND_ATTEMPTS) {
          setResendBlockedUntil(Date.now() + RESEND_COOLDOWN_MS);
          setError('Zu viele Anfragen. Code erneut senden ist jetzt 15 Minuten gesperrt.');
          return;
        }
        setInfo('Wir haben einen neuen Verifizierungscode an deine E-Mail-Adresse gesendet.');
      })
      .catch(() => {
        setError('Der Verifizierungscode konnte nicht erneut gesendet werden.');
      })
      .finally(() => {
        setIsResending(false);
      });
  };

  if (isLoading || isFlagsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (redirectAfterLogin) {
    return <Navigate to={BROWSE_EVENTS_PATH} replace />;
  }

  return (
    <div>
      <div className="container mx-auto px-4 py-4">
        <BackButton variant="ghost" className="mb-4" fallbackPath="/" />
        <div className="max-w-md mx-auto md:py-12">
          <div className="bg-card rounded-lg border p-8 shadow-lg">
            {!verificationEmail && !showForgotPassword && (
              <>
                <h1 className="text-3xl mb-2">Willkommen zurück</h1>
                <p className="text-muted-foreground mb-8">
                  Melde dich bei deinem BazarPro-Konto an
                </p>
              </>
            )}

            {error && (
              <Alert variant="destructive" className="mb-6" data-testid="alert-wrong-login">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {info && !verificationEmail && !showForgotPassword && (
              <Alert className="mb-6">
                <AlertDescription>{info}</AlertDescription>
              </Alert>
            )}

            {!isLoginEnabled && !verificationEmail && !showForgotPassword && (
              <Alert variant="destructive" className="mb-6">
                <AlertDescription>
                  Die Anmeldung ist derzeit deaktiviert. Bitte versuche es später erneut.
                </AlertDescription>
              </Alert>
            )}

            {!verificationEmail && !showForgotPassword ? (
              <>
                <form onSubmit={handleSubmit} className="space-y-6" data-testid="form-login">
                  <div className="space-y-2" data-testid="field-login-email">
                    <Label htmlFor="email">E-Mail-Adresse</Label>
                    <Input
                      id="email"
                      type="email"
                      name="email"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="deine@email.de"
                      required
                      disabled={!isLoginEnabled}
                    />
                  </div>

                  <div className="space-y-2" data-testid="field-login-password">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Passwort</Label>
                      <button
                        type="button"
                        className="text-sm text-primary hover:underline"
                        disabled={!isLoginEnabled}
                        onClick={() => setShowForgotPassword(true)}
                      >
                        Passwort vergessen?
                      </button>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={!isLoginEnabled}
                    />
                  </div>

                  <Button
                    type="submit"
                    className={`w-full ${showReactivation ? 'test' : ''}`}
                    disabled={!isLoginEnabled}
                    loading={isSubmitting}
                    data-testid="button-login-submit"
                  >
                    {showReactivation ? 'Account reaktivieren' : 'Anmelden'}
                  </Button>
                </form>

                <div className="my-6 relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-card text-muted-foreground">Oder fortfahren mit</span>
                  </div>
                </div>

                <div className="space-y-3" data-testid="login-div-oauth">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => signIn('google', { redirectTo: '/login?oauth=1' })}
                    disabled={!isLoginEnabled || isSubmitting}
                  >
                    <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Sign in with Google
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => signIn('github', { redirectTo: '/login?oauth=1' })}
                    disabled={!isLoginEnabled || isSubmitting}
                  >
                    <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                      />
                    </svg>
                    Sign in with GitHub
                  </Button>
                </div>

                <div className="mt-6 text-center text-sm" data-testid="div-login-register">
                  <span className="text-muted-foreground">Noch kein Konto? </span>
                  <button
                    onClick={() => navigate('/register')}
                    className="text-primary hover:underline"
                  >
                    Jetzt registrieren
                  </button>
                </div>
              </>
            ) : verificationEmail ? (
              <EmailVerificationForm
                email={verificationEmail}
                verificationCode={verificationCode}
                setVerificationCode={setVerificationCode}
                handleVerifyEmail={handleVerifyEmail}
                isVerifying={isVerifying}
                resendVerificationCode={resendVerificationCode}
                isResendBlocked={isResendBlocked}
                resendRemainingSeconds={resendRemainingSeconds}
                isResending={isResending}
              />
            ) : (
              <ForgotPasswordForm
                onBack={() => {
                  setShowForgotPassword(false);
                  setError('');
                  setInfo('');
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
