import { PasswordInput } from '../../../components/auth/PasswordInput';
import { MIN_PASSWORD_LENGTH } from '../../../shared/constants';
import { BackButton } from '../../../components/navigation/BackButton';
import { Navigate, useNavigate } from 'react-router-dom';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { useAuthState, useAuthActions } from '../../../lib/api/react';
import { Label } from '../../../components/ui/label';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useFeatureFlags } from '../../../hooks/useFeatureFlags';
import { useRedirectAfterLogin, BROWSE_EVENTS_PATH } from '../../../hooks/useRedirectAfterLogin';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { AuthFormSkeleton } from '../../../components/ui/loading';
import { useEffect, useMemo, useState } from 'react';
import { EmailVerificationForm } from './components/EmailVerificationForm';
import { OAuthButtons } from './components/OAuthButtons';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';
import { apiErrorCode, appErrorData, getUserFacingErrorMessage } from '../../../lib/errors';
import { setFlowSelectionOnboardingPending } from '../../../lib/onboardingTrigger';
import { loginPath, safeRedirectPath } from '../../../lib/loginRedirect';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import i18n, { currentLocale } from '../../../i18n';

function buildRegisterSchema(t: TFunction<'auth'>) {
  return z.object({
    email: z.string().email(t('validation.email')),
    password: z.string().min(MIN_PASSWORD_LENGTH, t('validation.minLength')),
    role: z.enum(['organizer', 'participant']),
  });
}

type RegisterFormData = z.infer<ReturnType<typeof buildRegisterSchema>>;
const MAX_RESEND_ATTEMPTS = 3;
const RESEND_COOLDOWN_MS = 15 * 60 * 1000;

export function RegisterPage() {
  const { t } = useTranslation('auth');
  const registerSchema = useMemo(() => buildRegisterSchema(t), [t]);
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoading } = useAuthState();
  const { signIn } = useAuthActions();
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendAttempts, setResendAttempts] = useState(0);
  const [resendBlockedUntil, setResendBlockedUntil] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(Date.now());
  const [verificationSucceeded, setVerificationSucceeded] = useState(false);
  const { isRegistrationEnabled, isLoading: isFlagsLoading } = useFeatureFlags();
  const redirectAfterLogin = useRedirectAfterLogin();
  const joinEventId = useMemo(
    () => new URLSearchParams(location.search).get('joinEventId'),
    [location.search]
  );
  const returnTo = safeRedirectPath(new URLSearchParams(location.search).get('redirect'));
  // The verification link comes back here; keep where the user wanted to go
  const registerRedirectTo = joinEventId
    ? `/register?joinEventId=${encodeURIComponent(joinEventId)}`
    : returnTo
      ? `/register?redirect=${encodeURIComponent(returnTo)}`
      : '/register';
  const postAuthRedirectPath = joinEventId
    ? `/public-events/${joinEventId}?openJoinDialog=1`
    : (returnTo ?? BROWSE_EVENTS_PATH);

  useEffect(() => {
    if (!redirectAfterLogin || verificationEmail || joinEventId) return;
    setFlowSelectionOnboardingPending();
  }, [redirectAfterLogin, verificationEmail, joinEventId]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      role: 'participant',
    },
    mode: 'onTouched',
  });

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
    const verifyCode = params.get('verifyCode');
    const emailFromLink = params.get('email');
    if (mode !== 'verify' || !verifyCode || !emailFromLink) {
      return;
    }

    setVerificationEmail(emailFromLink);
    setVerificationCode(verifyCode);
    setIsVerifying(true);
    signIn('password', {
      email: emailFromLink,
      code: verifyCode,
      flow: 'email-verification',
    })
      .then(() => {
        setVerificationEmail(null);
        setVerificationCode('');
        setVerificationSucceeded(true);
        toast.success(i18n.t('verify.confirmed', { ns: 'auth' }));
      })
      .catch(() => {
        setError(i18n.t('register.linkInvalid', { ns: 'auth' }));
      })
      .finally(() => {
        setIsVerifying(false);
      });
  }, [location.search, signIn]);

  const onSubmit = async (data: RegisterFormData) => {
    if (!isRegistrationEnabled) return;

    setError('');
    setInfo('');

    try {
      const result = await signIn('password', {
        email: data.email,
        password: data.password,
        role: data.role,
        // The verification email goes out in the language of the app
        locale: currentLocale(),
        flow: 'signUp',
        redirectTo: registerRedirectTo,
      });
      if (!result.signingIn) {
        setVerificationEmail(data.email);
        setInfo(t('verify.pleaseConfirm'));
        toast.success(t('register.started'));
      }
    } catch (err) {
      console.error(err);
      const code = apiErrorCode(err);
      if (code === 'ACCOUNT_ALREADY_EXISTS') {
        setError(t('register.exists'));
      } else if (code === 'ACCOUNT_DELETED' || code === 'ACCOUNT_BANNED') {
        setError(t('register.deletedOrBanned'));
      } else {
        setError(appErrorData(err) ? getUserFacingErrorMessage(err) : t('register.failed'));
      }
    }
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
        setVerificationEmail(null);
        setVerificationCode('');
        setVerificationSucceeded(true);
        toast.success(t('verify.confirmed'));
      })
      .catch((err) => {
        setError(
          apiErrorCode(err) === 'INVALID_CODE' ? t('verify.codeInvalid') : t('errors.unexpected')
        );
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
      redirectTo: registerRedirectTo,
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

  if (isLoading || isFlagsLoading || (verificationSucceeded && !redirectAfterLogin)) {
    return <AuthFormSkeleton />;
  }

  if (redirectAfterLogin && !verificationEmail) {
    return <Navigate to={postAuthRedirectPath} replace />;
  }

  return (
    <div>
      <div className="container mx-auto px-4 py-4">
        <BackButton variant="ghost" className="mb-4" fallbackPath="/" />
        <div className="max-w-md mx-auto md:py-12" data-testid="register-form">
          <div className="bg-card rounded-lg border p-8 shadow-lg">
            {!verificationEmail ? (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h1 className="text-3xl font-bold tracking-tight">{t('register.title')}</h1>
                  <p className="text-muted-foreground">{t('register.subtitle')}</p>
                </div>

                {!isRegistrationEnabled && (
                  <Alert variant="destructive">
                    <AlertDescription>{t('register.disabled')}</AlertDescription>
                  </Alert>
                )}
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {info && (
                  <Alert>
                    <AlertDescription>{info}</AlertDescription>
                  </Alert>
                )}

                <OAuthButtons returnTo={postAuthRedirectPath} disabled={!isRegistrationEnabled} />

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('email')}</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      {...register('email')}
                      placeholder={t('emailPlaceholder')}
                      disabled={!isRegistrationEnabled}
                      aria-invalid={!!errors.email}
                      data-testid="register-emailfield"
                    />
                    {errors.email && (
                      <p className="text-destructive dark:text-red-400 text-xs font-medium">
                        {errors.email.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">{t('password')}</Label>
                    <PasswordInput
                      id="password"
                      autoComplete="new-password"
                      {...register('password')}
                      disabled={!isRegistrationEnabled}
                      aria-invalid={!!errors.password}
                      aria-describedby="password-hint"
                      data-testid="register-password"
                    />
                    <p
                      id="password-hint"
                      className={`text-xs ${errors.password ? 'text-destructive dark:text-red-400 font-medium' : 'text-muted-foreground'}`}
                    >
                      {errors.password?.message ?? t('register.passwordHint')}
                    </p>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={!isRegistrationEnabled || isSubmitting}
                    loading={isSubmitting}
                    data-testid="register-button-submit"
                  >
                    {t('register.submit')}
                  </Button>

                  <p className="text-xs text-muted-foreground" data-testid="register-terms">
                    <Trans
                      i18nKey="register.terms"
                      ns="auth"
                      components={{
                        terms: (
                          <a
                            href="/terms"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          />
                        ),
                        privacy: (
                          <a
                            href="/privacy"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          />
                        ),
                      }}
                    />
                  </p>
                </form>

                <div className="text-center text-sm">
                  <span className="text-muted-foreground">{t('register.haveAccount')} </span>
                  <button
                    type="button"
                    onClick={() => navigate(loginPath(returnTo ?? undefined))}
                    className="text-primary font-semibold hover:underline"
                  >
                    {t('register.loginNow')}
                  </button>
                </div>
              </div>
            ) : (
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
                error={error}
                info={info}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
