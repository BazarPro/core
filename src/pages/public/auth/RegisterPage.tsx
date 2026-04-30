import { Check, X, Mail, Lock, UserPlus, ArrowRight } from 'lucide-react';
import { BackButton } from '../../../components/navigation/BackButton';
import { Navigate, useNavigate } from 'react-router-dom';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
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
import { extractConvexErrorMessage } from '../../../lib/errors';
import { setFlowSelectionOnboardingPending } from '../../../lib/onboardingTrigger';

const registerSchema = z
  .object({
    email: z.string().email('Ungültige E-Mail-Adresse'),
    password: z
      .string()
      .min(10, 'Mindestens 10 Zeichen')
      .regex(/[A-Z]/, 'Mindestens ein Großbuchstabe')
      .regex(/[a-z]/, 'Mindestens ein Kleinbuchstabe')
      .regex(/[0-9]/, 'Mindestens eine Zahl')
      .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Mindestens ein Sonderzeichen'),
    confirmPassword: z.string(),
    role: z.enum(['organizer', 'participant']),
    termsAccepted: z.literal(true, {
      message: 'Bitte akzeptiere die Nutzungsbedingungen',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwörter stimmen nicht überein',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;
const MAX_RESEND_ATTEMPTS = 3;
const RESEND_COOLDOWN_MS = 15 * 60 * 1000;

export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoading } = useConvexAuth();
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
  const registerRedirectTo = joinEventId
    ? `/register?joinEventId=${encodeURIComponent(joinEventId)}`
    : '/register';
  const postAuthRedirectPath = joinEventId
    ? `/public-events/${joinEventId}?openJoinDialog=1`
    : BROWSE_EVENTS_PATH;

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
    if (!password) return { text: '', color: '' };
    if (metRequirementsCount <= 2) return { text: 'Schwach', color: 'bg-red-500' };
    if (metRequirementsCount <= 4) return { text: 'Mittel', color: 'bg-yellow-500' };
    return { text: 'Stark', color: 'bg-green-500' };
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
        toast.success('E-Mail erfolgreich bestätigt. Du wirst jetzt angemeldet.');
      })
      .catch((err) => {
        const message = extractConvexErrorMessage(err);
        setError(
          message && message.length < 180
            ? message
            : 'Verifizierungslink ungültig oder abgelaufen. Bitte fordere einen neuen Code an.'
        );
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
        flow: 'signUp',
        redirectTo: registerRedirectTo,
      });
      if (!result.signingIn) {
        setVerificationEmail(data.email);
        setInfo(
          'Bitte bestätige deine E-Mail-Adresse. Du kannst den Code eingeben oder direkt auf den Link in der Mail klicken.'
        );
        toast.success('Registrierung erfolgreich gestartet. Bitte bestätige deine E-Mail-Adresse.');
      }
    } catch (err) {
      console.error(err);
      const message = extractConvexErrorMessage(err);
      const normalized = message.toLowerCase();
      if (
        normalized.includes('account_already_exists') ||
        normalized.includes('already exists') ||
        normalized.includes('already linked') ||
        normalized.includes('already registered')
      ) {
        setError(
          'Zu dieser E-Mail existiert bereits ein Konto. Bitte melde dich an oder nutze Passwort vergessen.'
        );
      } else if (normalized.includes('account_deleted') || normalized.includes('account_banned')) {
        setError(
          'Der Account zu dieser E-Mail wurde gelöscht oder gebannt. Um den Account zu reaktivieren, melde dich über die Login-seite an. Falls das nicht funktioniert oder dein Account gebannt wurde wende dich an den Support.'
        );
      } else {
        setError(
          message && message.length < 180
            ? message
            : 'Registrierung fehlgeschlagen. Bitte versuche es später erneut.'
        );
      }
    }
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
        setVerificationEmail(null);
        setVerificationCode('');
        setVerificationSucceeded(true);
        toast.success('E-Mail erfolgreich bestätigt. Du wirst jetzt angemeldet.');
      })
      .catch((err) => {
        const message = extractConvexErrorMessage(err);
        const normalized = message.toLowerCase();
        setError(
          normalized.includes('invalid') ||
            normalized.includes('ungültig') ||
            normalized.includes('abgelaufen') ||
            normalized.includes('verify') ||
            normalized.includes('code')
            ? 'Der Code ist ungültig oder abgelaufen. Bitte fordere einen neuen Code an.'
            : 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später erneut.'
        );
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
      redirectTo: registerRedirectTo,
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
                  <h1 className="text-3xl font-bold tracking-tight">Konto erstellen</h1>
                  <p className="text-muted-foreground text-sm">
                    Erstelle dein BazarPro-Konto und starte noch heute
                  </p>
                </div>

                {!isRegistrationEnabled && (
                  <Alert variant="destructive" className="animate-in zoom-in-95 duration-300">
                    <AlertDescription>
                      Die Registrierung ist derzeit deaktiviert. Bitte versuche es später erneut.
                    </AlertDescription>
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
                    <Label htmlFor="email">E-Mail-Adresse</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        className="pl-10"
                        {...register('email')}
                        placeholder="deine@email.de"
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
                    <Label htmlFor="password">Passwort</Label>
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
                          <RequirementItem met={passwordRequirements.length} text="10+ Zeichen" />
                          <RequirementItem
                            met={passwordRequirements.uppercase}
                            text="Großbuchstabe"
                          />
                          <RequirementItem
                            met={passwordRequirements.lowercase}
                            text="Kleinbuchstabe"
                          />
                          <RequirementItem met={passwordRequirements.number} text="Zahl" />
                          <RequirementItem
                            met={passwordRequirements.special}
                            text="Sonderzeichen"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
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
                            <Check className="h-3 w-3" /> Passwörter stimmen überein
                          </span>
                        ) : (
                          <span className="text-destructive dark:text-red-400 flex items-center gap-1">
                            <X className="h-3 w-3" /> Passwörter stimmen nicht überein
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
                          Ich akzeptiere die{' '}
                          <a
                            href="/terms"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary font-medium hover:underline"
                          >
                            Nutzungsbedingungen
                          </a>{' '}
                          und{' '}
                          <a
                            href="/privacy"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary font-medium hover:underline"
                          >
                            Datenschutzrichtlinien
                          </a>{' '}
                          von BazarPro.
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
                    Konto erstellen
                    {!isSubmitting && (
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    )}
                  </Button>
                </form>

                <div className="text-center text-sm pt-2">
                  <span className="text-muted-foreground">Bereits ein Konto? </span>
                  <button
                    onClick={() => navigate('/login')}
                    className="text-primary font-semibold hover:underline"
                  >
                    Jetzt anmelden
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
