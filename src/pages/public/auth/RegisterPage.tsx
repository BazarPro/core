import { Check, X, Mail, Lock, UserPlus, ArrowRight } from 'lucide-react';
import { BackButton } from '../../../components/navigation/BackButton';
import { Navigate, useNavigate } from 'react-router-dom';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { useAuthState, useAuthActions } from '../../../lib/api/react';
import { Label } from '../../../components/ui/label';
import { Checkbox } from '../../../components/ui/checkbox';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useFeatureFlags } from '../../../hooks/useFeatureFlags';
import { useRedirectAfterLogin, BROWSE_EVENTS_PATH } from '../../../hooks/useRedirectAfterLogin';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { useEffect, useMemo, useState } from 'react';
import { EmailVerificationForm } from './components/EmailVerificationForm';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';
import { apiErrorCode, appErrorData, getUserFacingErrorMessage } from '../../../lib/errors';
import { setFlowSelectionOnboardingPending } from '../../../lib/onboardingTrigger';
import { loginPath, safeRedirectPath } from '../../../lib/loginRedirect';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import i18n, { currentLocale } from '../../../i18n';

function buildRegisterSchema(t: TFunction<'auth'>) {
  return z
    .object({
      email: z.string().email(t('validation.email')),
      password: z
        .string()
        .min(10, t('validation.minLength'))
        .regex(/[A-Z]/, t('validation.uppercase'))
        .regex(/[a-z]/, t('validation.lowercase'))
        .regex(/[0-9]/, t('validation.number'))
        .regex(/[!@#$%^&*(),.?":{}|<>]/, t('validation.special')),
      confirmPassword: z.string(),
      role: z.enum(['organizer', 'participant']),
      termsAccepted: z.literal(true, { message: t('validation.terms') }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('validation.mismatch'),
      path: ['confirmPassword'],
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
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
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
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      role: 'participant',
      termsAccepted: false as unknown as true,
    },
    mode: 'onChange',
    reValidateMode: 'onChange',
  });

  const password = watch('password');
  const confirmPassword = watch('confirmPassword');

  const passwordRequirements = {
    length: (password?.length || 0) >= 10,
    uppercase: /[A-Z]/.test(password || ''),
    lowercase: /[a-z]/.test(password || ''),
    number: /[0-9]/.test(password || ''),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password || ''),
  };

  const isPasswordValid = Object.values(passwordRequirements).every(Boolean);
  const metRequirementsCount = Object.values(passwordRequirements).filter(Boolean).length;

  const getPasswordStrength = () => {
    if (!password) return { color: '' };
    if (metRequirementsCount <= 2) return { color: 'bg-red-500' };
    if (metRequirementsCount <= 4) return { color: 'bg-yellow-500' };
    return { color: 'bg-green-500' };
  };

  const strength = getPasswordStrength();
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

  if (isLoading || isFlagsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (verificationSucceeded && !redirectAfterLogin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (redirectAfterLogin && !verificationEmail) {
    return <Navigate to={postAuthRedirectPath} replace />;
  }

  return (
    <div>
      <div className="container mx-auto px-4 py-4">
        <BackButton variant="ghost" className="mb-4" fallbackPath="/" />
        <div className="max-w-md mx-auto md:py-12" data-testid="register-form">
          <div className="bg-card rounded-xl border p-8 shadow-lg transition-all duration-500">
            {!verificationEmail ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-2">
                    <UserPlus className="w-8 h-8" />
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight">{t('register.title')}</h1>
                  <p className="text-muted-foreground text-sm">{t('register.subtitle')}</p>
                </div>

                {!isRegistrationEnabled && (
                  <Alert variant="destructive" className="animate-in zoom-in-95 duration-300">
                    <AlertDescription>{t('register.disabled')}</AlertDescription>
                  </Alert>
                )}
                {error && (
                  <Alert variant="destructive" className="animate-in zoom-in-95 duration-300">
                    <AlertDescription className="flex items-center gap-2">
                      <X className="h-4 w-4" />
                      {error}
                    </AlertDescription>
                  </Alert>
                )}

                {info && (
                  <Alert className="animate-in zoom-in-95 duration-300">
                    <AlertDescription>{info}</AlertDescription>
                  </Alert>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('email')}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        className="pl-10"
                        {...register('email')}
                        placeholder={t('emailPlaceholder')}
                        disabled={!isRegistrationEnabled}
                        data-testid="register-emailfield"
                      />
                    </div>
                    {errors.email && (
                      <p className="text-destructive dark:text-red-400 text-xs font-medium">
                        {errors.email.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">{t('password')}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        autoComplete="new-password"
                        className="pl-10"
                        {...register('password')}
                        onFocus={() => setIsPasswordFocused(true)}
                        onBlur={() => setIsPasswordFocused(false)}
                        disabled={!isRegistrationEnabled}
                        data-testid="register-password"
                        placeholder="••••••••"
                      />
                    </div>

                    {(isPasswordFocused || (password && !isPasswordValid)) && (
                      <div className="space-y-3 pt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex gap-1 h-1">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div
                              key={i}
                              className={`flex-1 rounded-full transition-colors duration-500 ${
                                i <= metRequirementsCount ? strength.color : 'bg-muted'
                              }`}
                            />
                          ))}
                        </div>
                        <div
                          className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs"
                          data-testid="register-div-password-requirements"
                        >
                          {(['length', 'uppercase', 'lowercase', 'number', 'special'] as const).map(
                            (rule) => (
                              <RequirementItem
                                key={rule}
                                met={passwordRequirements[rule]}
                                text={t(`passwordRules.${rule}`)}
                              />
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">{t('register.confirmPassword')}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        className="pl-10"
                        {...register('confirmPassword')}
                        disabled={!isRegistrationEnabled}
                        data-testid="register-password-confirm"
                        placeholder="••••••••"
                      />
                    </div>
                    {confirmPassword.length > 0 && (
                      <div className="flex items-center gap-2 text-xs pt-1 animate-in fade-in duration-300">
                        {confirmPassword === password ? (
                          <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                            <Check className="h-3 w-3" /> {t('passwordRules.match')}
                          </span>
                        ) : (
                          <span className="text-destructive dark:text-red-400 flex items-center gap-1">
                            <X className="h-3 w-3" /> {t('passwordRules.noMatch')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <div
                      className="p-3 rounded-lg border bg-muted/20 relative"
                      data-testid="register-terms"
                    >
                      <div className="absolute left-3 top-[14px]">
                        <Controller
                          name="termsAccepted"
                          control={control}
                          render={({ field }) => (
                            <Checkbox
                              id="terms"
                              checked={Boolean(field.value)}
                              onCheckedChange={(val) => field.onChange(val === true)}
                              disabled={!isRegistrationEnabled}
                              data-testid="register-terms-checkbox"
                            />
                          )}
                        />
                      </div>
                      <div className="pl-7">
                        <Label
                          htmlFor="terms"
                          className="text-xs cursor-pointer leading-relaxed text-muted-foreground block"
                        >
                          <Trans
                            i18nKey="register.terms"
                            ns="auth"
                            components={{
                              terms: (
                                <a
                                  href="/terms"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary font-medium hover:underline"
                                />
                              ),
                              privacy: (
                                <a
                                  href="/privacy"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary font-medium hover:underline"
                                />
                              ),
                            }}
                          />
                        </Label>
                      </div>
                    </div>
                    {errors.termsAccepted && (
                      <p className="text-destructive dark:text-red-400 text-xs font-medium mt-1.5 ml-1">
                        {errors.termsAccepted.message}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 text-base group"
                    disabled={!isRegistrationEnabled || isSubmitting}
                    loading={isSubmitting}
                    data-testid="register-button-submit"
                  >
                    {t('register.submit')}
                    {!isSubmitting && (
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    )}
                  </Button>
                </form>

                <div className="text-center text-sm pt-2">
                  <span className="text-muted-foreground">{t('register.haveAccount')} </span>
                  <button
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

function RequirementItem({ met, text }: { met: boolean; text: string }) {
  return (
    <div
      className={`flex items-center gap-1.5 transition-colors duration-300 ${met ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}
    >
      {met ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0 opacity-50" />}
      <span className="truncate">{text}</span>
    </div>
  );
}
