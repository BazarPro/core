import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthActions } from '../../../lib/api/react';
import { Button } from '../../../components/ui/button';
import { Label } from '../../../components/ui/label';
import { Shield } from 'lucide-react';
import { PasswordInput } from '../../../components/auth/PasswordInput';
import { MIN_PASSWORD_LENGTH } from '../../../shared/constants';
import { toast } from 'sonner';
import { apiErrorCode } from '../../../lib/errors';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

function buildSecuritySchema(t: TFunction<'account'>) {
  return z.object({
    oldPassword: z.string().min(1, t('security.oldRequired')),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH, t('security.rules.length')),
  });
}

type SecurityFormData = z.infer<ReturnType<typeof buildSecuritySchema>>;

interface SecurityCardProps {
  providers: string[];
}

export function SecurityCard({ providers }: SecurityCardProps) {
  const { t } = useTranslation('account');
  const securitySchema = useMemo(() => buildSecuritySchema(t), [t]);
  const { changePassword } = useAuthActions();
  const hasPasswordProvider = providers.some((p) => p === 'password');
  const isOAuth = providers.some((p) => p === 'github' || p === 'google');

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SecurityFormData>({
    resolver: zodResolver(securitySchema),
    mode: 'onTouched',
    defaultValues: {
      oldPassword: '',
      newPassword: '',
    },
  });

  const onSubmit = async (data: SecurityFormData) => {
    try {
      await changePassword(data.oldPassword, data.newPassword);
      toast.success(t('security.saved'));
      reset();
    } catch (error: unknown) {
      console.error('Failed to change password:', error);
      const code = apiErrorCode(error);
      if (code === 'account.wrongPassword') {
        setError('oldPassword', {
          message: t('security.wrongOld'),
        });
      } else if (code === 'TOO_MANY_FAILED_ATTEMPTS') {
        toast.error(t('security.tooManyAttempts'));
      } else if (code === 'PASSWORD_ACCOUNT_NOT_FOUND') {
        toast.error(t('security.noPassword'));
      } else if (code === 'PASSWORD_ACCOUNT_INCOMPLETE') {
        toast.error(t('security.incomplete'));
      } else {
        toast.error(t('security.failed'));
      }
    }
  };

  return (
    <div className="bg-card rounded-xl border shadow-sm overflow-hidden mb-8">
      <div className="p-6 border-b bg-muted/10">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-medium">{t('security.title')}</h3>
        </div>
      </div>
      <div className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {isOAuth && (
            <div className="mb-6 p-4 bg-muted rounded-lg border">
              <p className="text-sm font-medium mb-2">{t('security.linkedAccounts')}</p>
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
                  {t('security.externalPassword')}
                </p>
              )}
            </div>
          )}

          {hasPasswordProvider && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="oldPassword">{t('security.oldPassword')}</Label>
                <PasswordInput
                  id="oldPassword"
                  autoComplete="current-password"
                  placeholder={t('security.oldPasswordPlaceholder')}
                  {...register('oldPassword')}
                />
                {errors.oldPassword && (
                  <p className="text-xs text-destructive dark:text-red-400">
                    {errors.oldPassword.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">{t('security.newPassword')}</Label>
                <PasswordInput
                  id="newPassword"
                  autoComplete="new-password"
                  aria-invalid={!!errors.newPassword}
                  aria-describedby="new-password-hint"
                  {...register('newPassword')}
                />
                <p
                  id="new-password-hint"
                  className={`text-xs ${errors.newPassword ? 'text-destructive dark:text-red-400' : 'text-muted-foreground'}`}
                >
                  {t('security.rules.length')}
                </p>
              </div>

              {isDirty && (
                <div className="pt-2">
                  <Button
                    loading={isSubmitting}
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full md:w-auto md:px-8"
                  >
                    {isSubmitting ? t('actions.saving', { ns: 'common' }) : t('security.save')}
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
