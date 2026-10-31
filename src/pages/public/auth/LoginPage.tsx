import { useAuthActions, useAuthState } from '../../../lib/api/react';
import { BackButton } from '../../../components/navigation/BackButton';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Label } from '@radix-ui/react-label';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { useFeatureFlags } from '../../../hooks/useFeatureFlags';
import { useRedirectAfterLogin, OVERVIEW_PATH } from '../../../hooks/useRedirectAfterLogin';
import { useEffect } from 'react';
import { EmailVerificationForm } from './components/EmailVerificationForm';
import { ForgotPasswordForm } from './components/ForgotPasswordForm';
import { OAuthButtons } from './components/OAuthButtons';
import { apiErrorCode } from '../../../lib/errors';
import { toast } from 'sonner';
import { safeRedirectPath } from '../../../lib/loginRedirect';
import { Trans, useTranslation } from 'react-i18next';
import { ServerSwitch } from '../../../native/ServerSwitch';
import { AuthFormSkeleton } from '../../../components/ui/loading';

const MAX_RESEND_ATTEMPTS = 3;
const RESEND_COOLDOWN_MS = 15 * 60 * 1000;

export function LoginPage() {
  const { t } = useTranslation('auth');
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

  const { isLoading } = useAuthState();
  const { isLoginEnabled, isLoading: isFlagsLoading } = useFeatureFlags();
  const redirectAfterLogin = useRedirectAfterLogin();
  const returnTo = safeRedirectPath(searchParams.get('redirect'));
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
        <Trans
          i18nKey="errors.bannedOrDeleted"
          ns="auth"
          components={{
            support: (
              <a href="mailto:support@bazarpro.de" className="underline hover:text-primary" />
            ),
          }}
        />
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

    if (showReactivation) {
      setIsSubmitting(true);
      try {
        await signIn('password', { flow: 'reactivate', email, password });
        toast.success(t('errors.reactivated'));
        setShowReactivation(false);
      } catch (err) {
        const code = apiErrorCode(err);
        setError(
          code === 'INVALID_CREDENTIALS'
            ? t('errors.invalidCredentials')
            : code === 'TOO_MANY_FAILED_ATTEMPTS'
              ? t('errors.tooManyAttempts')
              : t('errors.reactivateFailed')
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!isLoginEnabled) return;

    if (!email || !password) {
      setError(t('errors.missingCredentials'));
      return;
    }

    setIsSubmitting(true);
    signIn('password', { email, password, flow: 'signIn', redirectTo: '/register' })
      .then(({ signingIn }) => {
        if (!signingIn) {
          setVerificationEmail(email);
          setInfo(t('verify.pleaseConfirm'));
          toast.success(t('verify.loginStarted'));
        }
      })
      .catch((err) => {
        const code = apiErrorCode(err);
        if (code === 'ACCOUNT_DELETED') {
          setError(t('errors.deleted'));
          setShowReactivation(true);
        } else if (code === 'ACCOUNT_BANNED') {
          setError(
            <Trans
              i18nKey="errors.banned"
              ns="auth"
              components={{
                support: (
                  <a href="mailto:support@bazarpro.de" className="underline hover:text-primary" />
                ),
              }}
            />
          );
        } else {
          setError(
            code === 'INVALID_CREDENTIALS'
              ? t('errors.invalidCredentials')
              : code === 'TOO_MANY_FAILED_ATTEMPTS'
                ? t('errors.tooManyAttempts')
                : t('errors.unexpected')
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
      setError(t('verify.enterCode'));
      return;
    }

    setIsVerifying(true);
    signIn('password', {
      email: verificationEmail,
      code: verificationCode,
      flow: 'email-verification',
    })
      .then(() => {
        toast.success(t('verify.confirmed'));
      })
      .catch((err) => {
        const code = apiErrorCode(err);
        if (code === 'ACCOUNT_DELETED') {
          setError(t('errors.deleted'));
          setShowReactivation(true);
          setVerificationEmail(null);
        } else if (code === 'ACCOUNT_BANNED') {
          setError(
            <Trans
              i18nKey="errors.banned"
              ns="auth"
              components={{
                support: (
                  <a href="mailto:support@bazarpro.de" className="underline hover:text-primary" />
                ),
              }}
            />
          );
          setVerificationEmail(null);
        } else {
          setError(code === 'INVALID_CODE' ? t('verify.codeInvalid') : t('errors.unexpected'));
        }
      })
      .finally(() => {
        setIsVerifying(false);
      });
  };

  const resendVerificationCode = async () => {
    if (!verificationEmail) return;
    if (isResendBlocked) {
      setError(t('verify.tooManyWait', { minutes: Math.ceil(resendRemainingSeconds / 60) }));
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
          setError(t('verify.tooManyBlocked'));
          return;
        }
        setInfo(t('verify.resent'));
      })
      .catch(() => {
        setError(t('verify.resendFailed'));
      })
      .finally(() => {
        setIsResending(false);
      });
  };

  if (isLoading || isFlagsLoading) {
    return <AuthFormSkeleton />;
  }

  if (redirectAfterLogin) {
    return <Navigate to={returnTo ?? OVERVIEW_PATH} replace />;
  }

  return (
    <div>
      <div className="container mx-auto px-4 py-4">
        <BackButton variant="ghost" className="mb-4" fallbackPath="/" />
        <div className="max-w-md mx-auto md:py-12">
          <div className="bg-card rounded-lg border p-8 shadow-lg">
            {!verificationEmail && !showForgotPassword && (
              <>
                <h1 className="text-3xl mb-2">{t('login.title')}</h1>
                <p className="text-muted-foreground mb-6">{t('login.subtitle')}</p>
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
                <AlertDescription>{t('login.disabled')}</AlertDescription>
              </Alert>
            )}

            {!verificationEmail && !showForgotPassword ? (
              <>
                <OAuthButtons returnTo={returnTo} disabled={!isLoginEnabled || isSubmitting} />
                <form onSubmit={handleSubmit} className="space-y-6" data-testid="form-login">
                  <div className="space-y-2" data-testid="field-login-email">
                    <Label htmlFor="email">{t('email')}</Label>
                    <Input
                      id="email"
                      type="email"
                      name="email"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('emailPlaceholder')}
                      required
                      disabled={!isLoginEnabled}
                    />
                  </div>

                  <div className="space-y-2" data-testid="field-login-password">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">{t('password')}</Label>
                      <button
                        type="button"
                        className="text-sm text-primary hover:underline"
                        disabled={!isLoginEnabled}
                        onClick={() => setShowForgotPassword(true)}
                      >
                        {t('login.forgotPassword')}
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
                    {showReactivation ? t('login.reactivate') : t('login.submit')}
                  </Button>
                </form>

                <div className="mt-6 text-center text-sm" data-testid="div-login-register">
                  <span className="text-muted-foreground">{t('login.noAccount')} </span>
                  <button
                    onClick={() =>
                      navigate(
                        returnTo
                          ? `/register?redirect=${encodeURIComponent(returnTo)}`
                          : '/register'
                      )
                    }
                    className="text-primary hover:underline"
                  >
                    {t('login.registerNow')}
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
          <ServerSwitch />
        </div>
      </div>
    </div>
  );
}
