import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Separator } from '../../../components/ui/separator';
import { Lock, User } from 'lucide-react';
import { toast } from 'sonner';
import type { Doc } from '../../../../convex/_generated/dataModel';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Alert, AlertDescription } from '../../../components/ui/alert';

function buildProfileSchema(t: TFunction<'account'>) {
  return z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z
      .string()
      .optional()
      .refine((val) => !val || /^\+?[0-9\s\-()]{7,20}$/.test(val), {
        message: t('profile.invalidPhone'),
      }),
    street: z.string().optional(),
    city: z.string().optional(),
    zipCode: z
      .string()
      .optional()
      .refine((val) => !val || /^\d{5}$/.test(val), {
        message: t('profile.invalidZip'),
      }),
    country: z.string().optional(),
  });
}

type ProfileFormData = z.infer<ReturnType<typeof buildProfileSchema>>;

interface ProfileCardProps {
  user: Doc<'users'>;
}

export function ProfileCard({ user }: ProfileCardProps) {
  const { t } = useTranslation('account');
  const profileSchema = useMemo(() => buildProfileSchema(t), [t]);
  const updateProfile = useMutation(api.users.update);
  // A bazaar keeps a record of the seller: name and address stay as registered
  const fixed = useQuery(api.users.isMyProfileFixed) === true;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    mode: 'onTouched',
  });

  // Live updates of the account fill the form, but never over what the user is typing
  useEffect(() => {
    if (user && !isDirty) {
      reset({
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        phone: user.phone ?? '',
        street: user.street ?? '',
        city: user.city ?? '',
        zipCode: user.zipCode ?? '',
        country: user.country ?? '',
      });
    }
  }, [user, reset, isDirty]);

  const onSubmit = async (data: ProfileFormData) => {
    try {
      await updateProfile(data);
      toast.success(t('profile.saved'));
      reset(data);
    } catch (error: unknown) {
      console.error('Failed to update profile:', error);
      toast.error(t('profile.saveFailed'), {
        description: getUserFacingErrorMessage(error),
      });
    }
  };

  return (
    <div className="bg-card rounded-xl border shadow-sm overflow-hidden mb-8">
      <div className="p-6 border-b bg-muted/10">
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-medium">{t('profile.title')}</h3>
        </div>
      </div>
      <div className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {fixed && (
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertDescription>{t('profile.fixed')}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">{t('profile.firstName')}</Label>
                <Input
                  id="firstName"
                  placeholder={t('profile.firstNamePlaceholder')}
                  readOnly={fixed}
                  {...register('firstName')}
                />
                {errors.firstName && (
                  <p className="text-xs text-destructive dark:text-red-400">
                    {errors.firstName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{t('profile.lastName')}</Label>
                <Input
                  id="lastName"
                  placeholder={t('profile.lastNamePlaceholder')}
                  readOnly={fixed}
                  {...register('lastName')}
                />
                {errors.lastName && (
                  <p className="text-xs text-destructive dark:text-red-400">
                    {errors.lastName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="phone">{t('profile.phone')}</Label>
                <Input
                  id="phone"
                  placeholder={t('profile.phonePlaceholder')}
                  {...register('phone')}
                />
                {errors.phone && (
                  <p className="text-xs text-destructive dark:text-red-400">
                    {errors.phone.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="street">{t('profile.street')}</Label>
              <Input
                id="street"
                placeholder={t('profile.streetPlaceholder')}
                readOnly={fixed}
                {...register('street')}
              />
              {errors.street && (
                <p className="text-xs text-destructive dark:text-red-400">
                  {errors.street.message}
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="zipCode">{t('profile.zipCode')}</Label>
                <Input
                  id="zipCode"
                  placeholder={t('profile.zipCodePlaceholder')}
                  readOnly={fixed}
                  {...register('zipCode')}
                />
                {errors.zipCode && (
                  <p className="text-xs text-destructive dark:text-red-400">
                    {errors.zipCode.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">{t('profile.city')}</Label>
                <Input
                  id="city"
                  placeholder={t('profile.cityPlaceholder')}
                  readOnly={fixed}
                  {...register('city')}
                />
                {errors.city && (
                  <p className="text-xs text-destructive dark:text-red-400">
                    {errors.city.message}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">{t('profile.country')}</Label>
              <Input
                id="country"
                placeholder={t('profile.countryPlaceholder')}
                readOnly={fixed}
                {...register('country')}
              />
              {errors.country && (
                <p className="text-xs text-destructive dark:text-red-400">
                  {errors.country.message}
                </p>
              )}
            </div>
          </div>

          {isDirty && (
            <div className="pt-2">
              <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto md:px-8">
                {isSubmitting ? t('actions.saving', { ns: 'common' }) : t('profile.save')}
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
