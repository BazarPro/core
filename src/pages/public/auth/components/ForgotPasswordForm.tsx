import { useEffect, useState } from 'react';
import { useAuthActions } from '../../../../lib/api/react';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Alert, AlertDescription } from '../../../../components/ui/alert';
import { toast } from 'sonner';
import { KeyRound, Mail, ShieldCheck, Check, X, ArrowRight } from 'lucide-react';
import { PasswordInput } from '../../../../components/auth/PasswordInput';
import { MIN_PASSWORD_LENGTH } from '../../../../shared/constants';
import { BackButton } from '../../../../components/navigation/BackButton';
import { apiErrorCode } from '../../../../lib/errors';
import { useTranslation } from 'react-i18next';

interface ForgotPasswordFormProps {
  onBack: () => void;
}

export function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
  const { t } = useTranslation('auth');
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequested, setIsRequested] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetCode = params.get('resetCode');
    const emailFromLink = params.get('email');
    if (emailFromLink) {
      setEmail(emailFromLink);
    }
    if (resetCode) {
      setCode(resetCode);
      setIsRequested(true);
      setInfo(t('reset.linkDetected'));
    }
  }, [t]);

  const isPasswordValid = newPassword.length >= MIN_PASSWORD_LENGTH;

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email) {
      setError(t('reset.enterEmail'));
      return;
    }

    setIsSubmitting(true);
    signIn('password', {
      email,
      flow: 'reset',
      redirectTo: '/login?mode=reset',
    })
      .then(() => {
        setIsRequested(true);
        setInfo(t('reset.requested'));
        toast.success(t('reset.requestedToast'));
      })
      .catch(() => {
        setError(t('reset.requestFailed'));
      })
      .finally(() => setIsSubmitting(false));
  };

  const submitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email || !code || !newPassword) {
      setError(t('reset.fillAll'));
      return;
    }
    if (!isPasswordValid) {
      setError(t('reset.notValid'));
      return;
    }

    setIsSubmitting(true);
    signIn('password', {
      email,
      code,
      newPassword,
      flow: 'reset-verification',
    })
      .then(() => {
        toast.success(t('reset.done'));
      })
      .catch((err) => {
        const code = apiErrorCode(err);
        if (code === 'INVALID_CODE' || code === 'INVALID_PASSWORD') {
          setError(t('reset.codeInvalid'));
          return;
        }
        setError(t('reset.failed'));
      })
      .finally(() => setIsSubmitting(false));
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-2">
          {isRequested ? <ShieldCheck className="w-8 h-8" /> : <KeyRound className="w-8 h-8" />}
        </div>
        <h2 className="text-2xl font-bold tracking-tight">
          {isRequested ? t('reset.titleSet') : t('reset.titleRequest')}
        </h2>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
          {isRequested ? t('reset.subtitleSet', { email }) : t('reset.subtitleRequest')}
        </p>
      </div>

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
          <AlertDescription className="flex items-center gap-2">
            <Check className="h-4 w-4" />
            {info}
          </AlertDescription>
        </Alert>
      )}

      {!isRequested ? (
        <form onSubmit={requestReset} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="resetEmail">{t('email')}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="resetEmail"
                type="email"
                className="pl-10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                required
                autoFocus
              />
            </div>
          </div>
          <Button
            loading={isSubmitting}
            type="submit"
            className="w-full h-11 text-base group"
            disabled={isSubmitting || !email}
          >
            <Mail className="mr-2 h-4 w-4" />
            {t('reset.requestCode')}
            {!isSubmitting && (
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            )}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitNewPassword} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resetCode">{t('verify.code')}</Label>
              <Input
                id="resetCode"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t('verify.codePlaceholder')}
                className="text-center text-xl tracking-[0.3em] font-bold h-12 uppercase"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">{t('reset.newPassword')}</Label>
              <PasswordInput
                id="newPassword"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                aria-describedby="new-password-hint"
                required
              />
              <p
                id="new-password-hint"
                className={`text-xs ${newPassword && !isPasswordValid ? 'text-destructive dark:text-red-400 font-medium' : 'text-muted-foreground'}`}
              >
                {t('register.passwordHint')}
              </p>
            </div>
          </div>

          <Button
            loading={isSubmitting}
            type="submit"
            className="w-full h-11 text-base group"
            disabled={isSubmitting || !isPasswordValid}
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            {t('reset.save')}
          </Button>
        </form>
      )}

      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">{t('or')}</span>
        </div>
      </div>

      <div className="flex justify-center">
        <BackButton
          type="button"
          variant="ghost"
          onBack={onBack}
          className="text-muted-foreground hover:text-foreground transition-colors"
        />
      </div>
    </div>
  );
}
