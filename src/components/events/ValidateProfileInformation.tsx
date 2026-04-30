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

const profileSchema = z.object({
  firstName: z.string().trim().min(1, 'Vorname ist erforderlich'),
  lastName: z.string().trim().min(1, 'Nachname ist erforderlich'),
  phone: z
    .string()
    .trim()
    .min(1, 'Telefonnummer ist erforderlich')
    .regex(/^\+?[0-9\s\-()]{7,20}$/, {
      message: 'Ungültiges Telefonnummer-Format (z.B. +49 123 456789)',
    }),
  street: z.string().trim().min(1, 'Straße ist erforderlich'),
  city: z.string().trim().min(1, 'Ort ist erforderlich'),
  zipCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, {
      message: 'Ungültige Postleitzahl (5 Ziffern erforderlich)',
    }),
  country: z.string().trim().min(1, 'Land ist erforderlich'),
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
        toast.success('Basisdaten erfolgreich aktualisiert!');
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
        toast.success('Adressdaten erfolgreich aktualisiert!');
        reset({ ...getValues(), ...result.data });
      }
    } catch (error: unknown) {
      console.error('Failed to update profile:', error);
      toast.error('Fehler beim Aktualisieren des Profils.', {
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
              <Label htmlFor="firstName">Vorname</Label>
              <Input id="firstName" placeholder="Dein Vorname" {...register('firstName')} />
              {errors.firstName && (
                <p className="text-xs text-destructive dark:text-red-400">
                  {errors.firstName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Nachname</Label>
              <Input id="lastName" placeholder="Dein Nachname" {...register('lastName')} />
              {errors.lastName && (
                <p className="text-xs text-destructive dark:text-red-400">
                  {errors.lastName.message}
                </p>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="phone">Telefonnummer</Label>
              <Input id="phone" placeholder="+49 123 456789" {...register('phone')} />
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
            <Label htmlFor="street">Straße und Hausnummer</Label>
            <Input id="street" placeholder="Musterstraße 123" {...register('street')} />
            {errors.street && (
              <p className="text-xs text-destructive dark:text-red-400">{errors.street.message}</p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="zipCode">Postleitzahl</Label>
              <Input id="zipCode" placeholder="12345" {...register('zipCode')} />
              {errors.zipCode && (
                <p className="text-xs text-destructive dark:text-red-400">
                  {errors.zipCode.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Ort</Label>
              <Input id="city" placeholder="Musterstadt" {...register('city')} />
              {errors.city && (
                <p className="text-xs text-destructive dark:text-red-400">{errors.city.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">Land</Label>
            <Input id="country" placeholder="Deutschland" {...register('country')} />
            {errors.country && (
              <p className="text-xs text-destructive dark:text-red-400">{errors.country.message}</p>
            )}
          </div>
        </div>
      )}

      <div className="pt-2">
        <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto md:px-8">
          {isSubmitting
            ? 'Wird gespeichert...'
            : currentStep === 'basic'
              ? 'Weiter'
              : 'Adresse speichern'}
        </Button>
      </div>
    </form>
  );
}
