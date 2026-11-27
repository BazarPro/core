import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';
import { Button } from '../../../components/ui/button';
import { CountrySelect } from '../../../components/ui/country-select';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Separator } from '../../../components/ui/separator';
import { FormSection } from '../../../components/ui/form-section';
import { Lock, User } from 'lucide-react';
import { toast } from 'sonner';
import type { Doc } from '../../../lib/api/types';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { isPostalCodeValid } from '../../../shared/constants';

function buildProfileSchema(t: TFunction<'account'>) {
  const schema = z.object({
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
    zipCode: z.string().optional(),
    country: z.string().optional(),
  });
  return schema.refine(({ zipCode, country }) => !zipCode || isPostalCodeValid(zipCode, country), {
    path: ['zipCode'],
    message: t('profile.invalidZip'),
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
  // A bazaar for its region let the seller in by postal code and country (#304)
  const regionFixed = useQuery(api.users.isMyPostalCodeFixed) === true;
  const postalCodeFixed = fixed || regionFixed;

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
    <FormSection icon={User} title={t('profile.title')}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {fixed && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>{t('profile.fixed')}</AlertDescription>
          </Alert>
        )}
        {regionFixed && !fixed && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>{t('profile.postalCodeFixed')}</AlertDescription>
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
                <p className="text-xs text-destructive">{errors.firstName.message}</p>
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
                <p className="text-xs text-destructive">{errors.lastName.message}</p>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="phone">{t('profile.phone')}</Label>
              <Input
                id="phone"
                placeholder={t('profile.phonePlaceholder')}
                {...register('phone')}
              />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
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
            {errors.street && <p className="text-xs text-destructive">{errors.street.message}</p>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="zipCode">{t('profile.zipCode')}</Label>
              <Input
                id="zipCode"
                placeholder={t('profile.zipCodePlaceholder')}
                readOnly={postalCodeFixed}
                {...register('zipCode')}
              />
              {errors.zipCode && (
                <p className="text-xs text-destructive">{errors.zipCode.message}</p>
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
              {errors.city && <p className="text-xs text-destructive">{errors.city.message}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">{t('profile.country')}</Label>
            <CountrySelect
              id="country"
              saved={user.country}
              emptyLabel={t('profile.countryNone')}
              disabled={postalCodeFixed}
              {...register('country')}
            />
            {errors.country && <p className="text-xs text-destructive">{errors.country.message}</p>}
          </div>
        </div>

        {isDirty && (
          <div className="pt-2">
            <Button
              loading={isSubmitting}
              type="submit"
              disabled={isSubmitting}
              className="w-full md:w-auto md:px-8"
            >
              {isSubmitting ? t('actions.saving', { ns: 'common' }) : t('profile.save')}
            </Button>
          </div>
        )}
      </form>
    </FormSection>
  );
}
