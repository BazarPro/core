import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Shield, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { extractConvexErrorMessage } from '../../../lib/errors';

const securitySchema = z
  .object({
    oldPassword: z.string().min(1, 'Altes Passwort ist erforderlich'),
    newPassword: z.string().min(10, 'Mindestens 10 Zeichen'),
    confirmPassword: z.string().min(1, 'Passwort-Bestätigung ist erforderlich'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Die Passwörter stimmen nicht überein',
    path: ['confirmPassword'],
  });

type SecurityFormData = z.infer<typeof securitySchema>;

interface SecurityCardProps {
  providers: string[];
}

export function SecurityCard({ providers }: SecurityCardProps) {
  const changePassword = useMutation(api.users.changePassword);
  const hasPasswordProvider = providers.some((p) => p === 'password');
  const isOAuth = providers.some((p) => p === 'github' || p === 'google');

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SecurityFormData>({
    resolver: zodResolver(securitySchema),
    mode: 'onTouched',
    defaultValues: {
      oldPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const newPasswordValue = watch('newPassword') || '';
  const confirmPasswordValue = watch('confirmPassword') || '';

  const onSubmit = async (data: SecurityFormData) => {
    try {
      await changePassword({
        oldPassword: data.oldPassword,
        newPassword: data.newPassword,
      });
      toast.success('Passwort erfolgreich geändert!');
      reset();
    } catch (error: unknown) {
      console.error('Failed to change password:', error);
      const msg = extractConvexErrorMessage(error);
      const normalized = msg.toLowerCase();
      if (normalized.includes('altes passwort')) {
        setError('oldPassword', {
          message: 'Das aktuelle Passwort stimmt nicht. Bitte überprüfe deine Eingabe.',
        });
      } else if (normalized.includes('password account not found')) {
        toast.error('Für dieses Konto ist kein Passwort hinterlegt.');
      } else if (normalized.includes('unvollständig')) {
        toast.error(
          'Das Passwortkonto ist unvollständig konfiguriert. Bitte Support kontaktieren.'
        );
      } else {
        toast.error('Passwort konnte nicht aktualisiert werden. Bitte versuche es erneut.');
      }
    }
  };

  const passwordRequirements = {
    length: newPasswordValue.length >= 10,
    uppercase: /[A-Z]/.test(newPasswordValue),
    lowercase: /[a-z]/.test(newPasswordValue),
    number: /[0-9]/.test(newPasswordValue),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(newPasswordValue),
  };

  const getPasswordStrength = () => {
    const metRequirements = Object.values(passwordRequirements).filter(Boolean).length;
    if (!newPasswordValue) return { text: '', color: '' };
    if (metRequirements <= 2) return { text: 'Schwach', color: 'bg-red-500' };
    if (metRequirements <= 4) return { text: 'Mittel', color: 'bg-yellow-500' };
    return { text: 'Stark', color: 'bg-green-500' };
  };

  const strength = getPasswordStrength();

  return (
    <div className="bg-card rounded-xl border shadow-sm overflow-hidden mb-8">
      <div className="p-6 border-b bg-muted/10">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-medium">Sicherheit</h3>
        </div>
      </div>
      <div className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {isOAuth && (
            <div className="mb-6 p-4 bg-muted rounded-lg border">
              <p className="text-sm font-medium mb-2">Verknüpfte Konten</p>
              <div className="flex flex-wrap gap-2">
                {providers.map((p) => (
                  <div
                    key={p}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 capitalize"
                  >
                    {p}
                  </div>
                ))}
              </div>
              {isOAuth && !hasPasswordProvider && (
                <p className="text-xs text-muted-foreground mt-3">
                  Da du dich über einen externen Anbieter angemeldet hast, wird dein Passwort dort
                  verwaltet.
                </p>
              )}
            </div>
          )}

          {hasPasswordProvider && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="oldPassword">Aktuelles Passwort</Label>
                <Input
                  id="oldPassword"
                  type="password"
                  placeholder="Dein aktuelles Passwort"
                  {...register('oldPassword')}
                />
                {errors.oldPassword && (
                  <p className="text-xs text-destructive dark:text-red-400">
                    {errors.oldPassword.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">Neues Passwort setzen</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Mindestens 10 Zeichen"
                  {...register('newPassword')}
                />
                {errors.newPassword && (
                  <p className="text-xs text-destructive dark:text-red-400">
                    {errors.newPassword.message}
                  </p>
                )}

                {newPasswordValue && (
                  <div className="space-y-2 mt-2">
                    <div className="flex gap-1 h-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className={`flex-1 rounded-full ${
                            i <= Object.values(passwordRequirements).filter(Boolean).length
                              ? strength.color
                              : 'bg-muted'
                          }`}
                        />
                      ))}
                    </div>
                    {strength.text && (
                      <p className="text-sm text-muted-foreground">{strength.text}</p>
                    )}
                  </div>
                )}

                <div className="space-y-1 text-sm mt-3">
                  <RequirementItem met={passwordRequirements.length} text="Mindestens 10 Zeichen" />
                  <RequirementItem met={passwordRequirements.uppercase} text="1 Großbuchstabe" />
                  <RequirementItem met={passwordRequirements.lowercase} text="1 Kleinbuchstabe" />
                  <RequirementItem met={passwordRequirements.number} text="1 Zahl" />
                  <RequirementItem met={passwordRequirements.special} text="1 Sonderzeichen" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Passwort erneut eingeben"
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-destructive dark:text-red-400">
                    {errors.confirmPassword.message}
                  </p>
                )}
                {!errors.confirmPassword && newPasswordValue && confirmPasswordValue && (
                  <div className="flex items-center gap-2 text-sm mt-1">
                    {newPasswordValue === confirmPasswordValue ? (
                      <>
                        <Check className="h-4 w-4 text-green-600" />
                        <span className="text-green-600">Passwörter stimmen überein</span>
                      </>
                    ) : (
                      <>
                        <X className="h-4 w-4 text-red-600" />
                        <span className="text-red-600">Passwörter stimmen nicht überein</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {isDirty && (
                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full md:w-auto md:px-8"
                  >
                    {isSubmitting ? 'Wird gespeichert...' : 'Passwort aktualisieren'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

function RequirementItem({ met, text }: { met: boolean; text: string }) {
  return (
    <div className={`flex items-center gap-2 ${met ? 'text-green-600' : 'text-muted-foreground'}`}>
      {met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      <span>{text}</span>
    </div>
  );
}
