import { useEffect, useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Alert, AlertDescription } from '../../../../components/ui/alert';
import { toast } from 'sonner';
import {
  KeyRound,
  Mail,
  ShieldCheck,
  Check,
  X,
  RefreshCw,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { BackButton } from '../../../../components/navigation/BackButton';
import { extractConvexErrorMessage } from '../../../../lib/errors';

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
      setInfo('Reset-Link erkannt. Bitte setze jetzt dein neues Passwort.');
    }
  }, []);

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
      setError('Bitte gib deine E-Mail-Adresse ein.');
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
        setInfo('Wir haben einen Code an deine E-Mail-Adresse gesendet.');
        toast.success('Passwort-Reset angefordert.');
      })
      .catch(() => {
        setError('Passwort-Reset konnte nicht gestartet werden. Bitte versuche es erneut.');
      })
      .finally(() => setIsSubmitting(false));
  };

  const submitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email || !code || !newPassword || !confirmPassword) {
      setError('Bitte fülle alle Felder aus.');
      return;
    }
    if (!isPasswordValid) {
      setError('Das neue Passwort erfüllt nicht alle Anforderungen.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Die Passwörter stimmen nicht überein.');
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
        toast.success('Passwort erfolgreich zurückgesetzt. Du bist jetzt angemeldet.');
      })
      .catch((err) => {
        const message = extractConvexErrorMessage(err);
        const normalized = message.toLowerCase();
        if (normalized.includes('invalid code') || normalized.includes('invalid')) {
          setError('Der Code ist ungültig oder abgelaufen. Bitte fordere einen neuen an.');
          return;
        }
        setError('Passwort konnte nicht zurückgesetzt werden. Bitte versuche es erneut.');
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
          {isRequested ? 'Passwort neu setzen' : 'Passwort vergessen?'}
        </h2>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
          {isRequested
            ? `Gib den Code ein, den wir an ${email} gesendet haben.`
            : 'Kein Problem! Wir senden dir einen Code zum Zurücksetzen deines Passworts.'}
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
            <Label htmlFor="resetEmail">E-Mail-Adresse</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="resetEmail"
                type="email"
                className="pl-10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deine@email.de"
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
            Code anfordern
            {!isSubmitting && (
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            )}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitNewPassword} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resetCode">Verifizierungscode</Label>
              <Input
                id="resetCode"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="CODE EINGEBEN"
                className="text-center text-xl tracking-[0.3em] font-bold h-12 uppercase"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">Neues Passwort</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="newPassword"
                  type="password"
                  className="pl-10"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mindestens 10 Zeichen"
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
                    <RequirementItem met={passwordRequirements.length} text="10+ Zeichen" />
                    <RequirementItem met={passwordRequirements.uppercase} text="Großbuchstabe" />
                    <RequirementItem met={passwordRequirements.lowercase} text="Kleinbuchstabe" />
                    <RequirementItem met={passwordRequirements.number} text="Zahl" />
                    <RequirementItem met={passwordRequirements.special} text="Sonderzeichen" />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Neues Passwort bestätigen</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type="password"
                  className="pl-10"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Passwort wiederholen"
                  required
                />
              </div>
              {confirmPassword && (
                <div className="flex items-center gap-2 text-xs pt-1 animate-in fade-in duration-300">
                  {newPassword === confirmPassword ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <Check className="h-3 w-3" /> Passwörter stimmen überein
                    </span>
                  ) : (
                    <span className="text-red-500 flex items-center gap-1">
                      <X className="h-3 w-3" /> Passwörter stimmen nicht überein
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
            Passwort speichern
          </Button>
        </form>
      )}

      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">Oder</span>
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
