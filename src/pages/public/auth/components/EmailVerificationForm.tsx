import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Mail, ArrowRight, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription } from '../../../../components/ui/alert';

interface EmailVerificationFormProps {
  email: string;
  verificationCode: string;
  setVerificationCode: (code: string) => void;
  handleVerifyEmail: (e: React.FormEvent) => void | Promise<void>;
  isVerifying: boolean;
  resendVerificationCode: () => void;
  isResendBlocked: boolean;
  resendRemainingSeconds: number;
  isResending: boolean;
  error?: string;
  info?: string;
}

export function EmailVerificationForm({
  email,
  verificationCode,
  setVerificationCode,
  handleVerifyEmail,
  isVerifying,
  resendVerificationCode,
  isResendBlocked,
  resendRemainingSeconds,
  isResending,
  error,
  info,
}: EmailVerificationFormProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {error && (
        <Alert variant="destructive" data-testid="email-verification-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {info && (
        <Alert data-testid="email-verification-info">
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      )}

      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-2">
          <Mail className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Prüfe dein Postfach</h2>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
          Wir haben einen 6-stelligen Verifizierungscode an{' '}
          <span className="font-medium text-foreground">{email}</span> gesendet.
        </p>
      </div>

      <form
        onSubmit={handleVerifyEmail}
        className="space-y-4"
        data-testid="form-email-verification"
      >
        <div className="space-y-2">
          <Label htmlFor="verificationCode" className="sr-only">
            Verifizierungscode
          </Label>
          <div className="relative">
            <Input
              id="verificationCode"
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.toUpperCase())}
              placeholder="CODE EINGEBEN"
              className="text-center text-2xl tracking-[0.5em] font-bold h-14 uppercase placeholder:tracking-normal placeholder:text-sm placeholder:font-normal"
              maxLength={10}
              required
              autoFocus
            />
          </div>
          <p className="text-[10px] text-center text-muted-foreground uppercase tracking-wider">
            Gib den Code genau so ein, wie er in der E-Mail erscheint
          </p>
        </div>

        <Button
          type="submit"
          className="w-full h-11 text-base group"
          disabled={isVerifying || !verificationCode}
        >
          {isVerifying ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          E-Mail bestätigen
          {!isVerifying && (
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          )}
        </Button>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Oder</span>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="w-full text-primary hover:text-primary hover:bg-primary/5"
          onClick={resendVerificationCode}
          disabled={isResendBlocked || isResending}
        >
          {isResending ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {isResendBlocked
            ? `Code erneut senden in ${resendRemainingSeconds}s`
            : 'Neuen Code anfordern'}
        </Button>
      </form>
    </div>
  );
}
