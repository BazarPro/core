import { useEffect } from 'react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';
import { toast } from 'sonner';
import z from 'zod';
import { useForm } from 'react-hook-form';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

/** Error text in the current language, read when validating */
const msg = (key: string, ns = 'events') => ({
  error: () => i18n.t(key as never, { ns }) as string,
});

const profileSchema = z.object({
  firstName: z.string().trim().min(1, msg('profile.firstNameRequired')),
  lastName: z.string().trim().min(1, msg('profile.lastNameRequired')),
  phone: z
    .string()
    .trim()
    .min(1, msg('profile.phoneRequired'))
    .regex(/^\+?[0-9\s\-()]{7,20}$/, msg('profile.invalidPhone', 'account')),
  street: z.string().trim().min(1, msg('profile.streetRequired')),
  city: z.string().trim().min(1, msg('profile.cityRequired')),
  zipCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, msg('profile.invalidZip', 'account')),
  country: z.string().trim().min(1, msg('profile.countryRequired')),
});

const basicProfileSchema = profileSchema.pick({
  firstName: true,
  lastName: true,
  phone: true,
});

const addressProfileSchema = profileSchema.pick({
  street: true,
  city: true,
  zipCode: true,
  country: true,
});

type ProfileFormData = z.infer<typeof profileSchema>;
type BasicProfileFormData = z.infer<typeof basicProfileSchema>;
type AddressProfileFormData = z.infer<typeof addressProfileSchema>;

interface ValidateProfileInformationProps {
  missingProfileData: string[];
  user: Doc<'users'>;
}

export function ValidateProfileInformation({
  missingProfileData,
  user,
}: ValidateProfileInformationProps) {
  const { t } = useTranslation('events');
  const updateProfile = useMutation(api.users.update);

  const showCard1 = missingProfileData.some((field) =>
    ['firstName', 'lastName', 'phone'].includes(field)
  );
  const showCard2 = missingProfileData.some((field) =>
    ['street', 'city', 'zipCode', 'country'].includes(field)
  );

  const currentStep = showCard1 ? 'basic' : showCard2 ? 'address' : 'done';

  const {
    register,
    reset,
    getValues,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormData>({
    mode: 'onTouched',
  });

  useEffect(() => {
    reset({
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      phone: user.phone ?? '',
      street: user.street ?? '',
      city: user.city ?? '',
      zipCode: user.zipCode ?? '',
      country: user.country ?? '',
    });
  }, [user, reset]);

  const applyZodErrors = (
    result: z.ZodSafeParseError<BasicProfileFormData | AddressProfileFormData>
  ) => {
    for (const issue of result.error.issues) {
      const fieldName = issue.path[0];
      if (typeof fieldName === 'string') {
        setError(fieldName as keyof ProfileFormData, {
          type: 'manual',
          message: issue.message,
        });
      }
    }
  };

  const onSubmit = async () => {
    try {
      clearErrors();

      if (currentStep === 'basic') {
        const values: BasicProfileFormData = {
          firstName: getValues('firstName'),
          lastName: getValues('lastName'),
          phone: getValues('phone'),
        };

        const result = basicProfileSchema.safeParse(values);

        if (!result.success) {
          applyZodErrors(result);
          return;
        }

        await updateProfile(result.data);
        toast.success(t('profile.basicSaved'));
        reset({ ...getValues(), ...result.data });
        return;
      }

      if (currentStep === 'address') {
        const values: AddressProfileFormData = {
          street: getValues('street'),
          city: getValues('city'),
          zipCode: getValues('zipCode'),
          country: getValues('country'),
        };

        const result = addressProfileSchema.safeParse(values);

        if (!result.success) {
          applyZodErrors(result);
          return;
        }

        await updateProfile(result.data);
        toast.success(t('profile.addressSaved'));
        reset({ ...getValues(), ...result.data });
      }
    } catch (error: unknown) {
      console.error('Failed to update profile:', error);
      toast.error(t('profile.saveFailed', { ns: 'account' }), {
        description: getUserFacingErrorMessage(error),
      });
    }
  };

  if (currentStep === 'done') {
    return null;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit();
      }}
      className="space-y-8"
      data-testid={`join-event-form`}
    >
      {currentStep == 'basic' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">{t('profile.firstName', { ns: 'account' })}</Label>
              <Input
                id="firstName"
                placeholder={t('profile.firstNamePlaceholder', { ns: 'account' })}
                {...register('firstName')}
              />
              {errors.firstName && (
                <p className="text-xs text-destructive dark:text-red-400">
                  {errors.firstName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">{t('profile.lastName', { ns: 'account' })}</Label>
              <Input
                id="lastName"
                placeholder={t('profile.lastNamePlaceholder', { ns: 'account' })}
                {...register('lastName')}
              />
              {errors.lastName && (
                <p className="text-xs text-destructive dark:text-red-400">
                  {errors.lastName.message}
                </p>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="phone">{t('profile.phone', { ns: 'account' })}</Label>
              <Input
                id="phone"
                placeholder={t('profile.phonePlaceholder', { ns: 'account' })}
                {...register('phone')}
              />
              {errors.phone && (
                <p className="text-xs text-destructive dark:text-red-400">{errors.phone.message}</p>
              )}
            </div>
          </div>
        </div>
      )}
      {currentStep == 'address' && (
        <div className="space-y-4" data-testid="join-event-address-form">
          <div className="space-y-2">
            <Label htmlFor="street">{t('profile.street', { ns: 'account' })}</Label>
            <Input
              id="street"
              placeholder={t('profile.streetPlaceholder', { ns: 'account' })}
              {...register('street')}
            />
            {errors.street && (
              <p className="text-xs text-destructive dark:text-red-400">{errors.street.message}</p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="zipCode">{t('profile.zipCode', { ns: 'account' })}</Label>
              <Input
                id="zipCode"
                placeholder={t('profile.zipCodePlaceholder', { ns: 'account' })}
                {...register('zipCode')}
              />
              {errors.zipCode && (
                <p className="text-xs text-destructive dark:text-red-400">
                  {errors.zipCode.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">{t('profile.city', { ns: 'account' })}</Label>
              <Input
                id="city"
                placeholder={t('profile.cityPlaceholder', { ns: 'account' })}
                {...register('city')}
              />
              {errors.city && (
                <p className="text-xs text-destructive dark:text-red-400">{errors.city.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">{t('profile.country', { ns: 'account' })}</Label>
            <Input
              id="country"
              placeholder={t('profile.countryPlaceholder', { ns: 'account' })}
              {...register('country')}
            />
            {errors.country && (
              <p className="text-xs text-destructive dark:text-red-400">{errors.country.message}</p>
            )}
          </div>
        </div>
      )}

      <div className="pt-2">
        <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto md:px-8">
          {isSubmitting
            ? t('actions.saving', { ns: 'common' })
            : currentStep === 'basic'
              ? t('profile.next')
              : t('profile.saveAddress')}
        </Button>
      </div>
    </form>
  );
}
