import { useEffect, useState } from 'react';
import { useAuthActions } from '../../../../lib/api/react';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Alert, AlertDescription } from '../../../../components/ui/alert';
import { toast } from 'sonner';
import { KeyRound, Mail, ShieldCheck, Check, X, RefreshCw, ArrowRight, Lock } from 'lucide-react';
import { BackButton } from '../../../../components/navigation/BackButton';
import { apiErrorCode } from '../../../../lib/errors';
import { useTranslation } from 'react-i18next';

const passwordRules = {
  length: (v: string) => v.length >= 10,
  uppercase: (v: string) => /[A-Z]/.test(v),
  lowercase: (v: string) => /[a-z]/.test(v),
  number: (v: string) => /[0-9]/.test(v),
  special: (v: string) => /[!@#$%^&*(),.?":{}|<>]/.test(v),
};

interface ForgotPasswordFormProps {
  onBack: () => void;
}

export function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
  const { t } = useTranslation('auth');
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  const passwordRequirements = {
    length: passwordRules.length(newPassword),
    uppercase: passwordRules.uppercase(newPassword),
    lowercase: passwordRules.lowercase(newPassword),
    number: passwordRules.number(newPassword),
    special: passwordRules.special(newPassword),
  };

  const isPasswordValid = Object.values(passwordRequirements).every(Boolean);
  const metRequirementsCount = Object.values(passwordRequirements).filter(Boolean).length;

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
    if (!email || !code || !newPassword || !confirmPassword) {
      setError(t('reset.fillAll'));
      return;
    }
    if (!isPasswordValid) {
      setError(t('reset.notValid'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('reset.mismatch'));
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
            type="submit"
            className="w-full h-11 text-base group"
            disabled={isSubmitting || !email}
          >
            {isSubmitting ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
            )}
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
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="newPassword"
                  type="password"
                  className="pl-10"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('reset.newPasswordPlaceholder')}
                  required
                />
              </div>

              {newPassword && (
                <div className="space-y-3 pt-1">
                  <div className="flex gap-1 h-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-full transition-colors duration-500 ${
                          i <= metRequirementsCount
                            ? metRequirementsCount <= 2
                              ? 'bg-red-500'
                              : metRequirementsCount <= 4
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                            : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
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
              <Label htmlFor="confirmPassword">{t('reset.confirmNew')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type="password"
                  className="pl-10"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('reset.repeatPlaceholder')}
                  required
                />
              </div>
              {confirmPassword && (
                <div className="flex items-center gap-2 text-xs pt-1 animate-in fade-in duration-300">
                  {newPassword === confirmPassword ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <Check className="h-3 w-3" /> {t('passwordRules.match')}
                    </span>
                  ) : (
                    <span className="text-red-500 flex items-center gap-1">
                      <X className="h-3 w-3" /> {t('passwordRules.noMatch')}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-11 text-base group"
            disabled={isSubmitting || !isPasswordValid || newPassword !== confirmPassword}
          >
            {isSubmitting ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
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

function RequirementItem({ met, text }: { met: boolean; text: string }) {
  return (
    <div
      className={`flex items-center gap-1.5 transition-colors duration-300 ${met ? 'text-green-600' : 'text-muted-foreground'}`}
    >
      {met ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0 opacity-50" />}
      <span className="truncate">{text}</span>
    </div>
  );
}
