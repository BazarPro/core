import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Separator } from '../../../components/ui/separator';
import { User } from 'lucide-react';
import { toast } from 'sonner';
import type { Doc } from '../../../../convex/_generated/dataModel';
import { getUserFacingErrorMessage } from '../../../lib/errors';

const profileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z
    .string()
    .optional()
    .refine((val) => !val || /^\+?[0-9\s\-()]{7,20}$/.test(val), {
      message: 'Ungültiges Telefonnummer-Format (z.B. +49 123 456789)',
    }),
  street: z.string().optional(),
  city: z.string().optional(),
  zipCode: z
    .string()
    .optional()
    .refine((val) => !val || /^\d{5}$/.test(val), {
      message: 'Ungültige Postleitzahl (5 Ziffern erforderlich)',
    }),
  country: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface ProfileCardProps {
  user: Doc<'users'>;
}

export function ProfileCard({ user }: ProfileCardProps) {
  const updateProfile = useMutation(api.users.update);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    mode: 'onTouched',
  });

  useEffect(() => {
    if (user) {
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
  }, [user, reset]);

  const onSubmit = async (data: ProfileFormData) => {
    try {
      await updateProfile(data);
      toast.success('Profil erfolgreich aktualisiert!');
      reset(data);
    } catch (error: unknown) {
      console.error('Failed to update profile:', error);
      toast.error('Fehler beim Aktualisieren des Profils.', {
        description: getUserFacingErrorMessage(error),
      });
    }
  };

  return (
    <div className="bg-card rounded-xl border shadow-sm overflow-hidden mb-8">
      <div className="p-6 border-b bg-muted/10">
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-medium">Persönliche Informationen & Adresse</h3>
        </div>
      </div>
      <div className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
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
              <Label htmlFor="street">Straße und Hausnummer</Label>
              <Input id="street" placeholder="Musterstraße 123" {...register('street')} />
              {errors.street && (
                <p className="text-xs text-destructive dark:text-red-400">
                  {errors.street.message}
                </p>
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
                  <p className="text-xs text-destructive dark:text-red-400">
                    {errors.city.message}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Land</Label>
              <Input id="country" placeholder="Deutschland" {...register('country')} />
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
                {isSubmitting ? 'Wird gespeichert...' : 'Profil aktualisieren'}
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
