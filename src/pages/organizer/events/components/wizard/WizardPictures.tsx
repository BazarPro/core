import { Check, Lock } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { ItemKind } from '../../../../../components/illustrations/ItemIllustrations';
import { Button } from '../../../../../components/ui/button';
import { ImageUpload } from '../../../../../components/ui/ImageUpload';
import { Label } from '../../../../../components/ui/label';
import { coverForKind, coverUrl, EVENT_COVERS } from '../../../../../lib/eventCovers';
import { cn } from '../../../../../lib/utils';

/** Own pictures cannot wait in the browser until the account exists. */
function LoginForUpload({ onLogin }: { onLogin: () => void }) {
  const { t } = useTranslation('organizer');
  return (
    <div className="space-y-3 rounded-lg border border-dashed bg-muted/30 p-4 text-center">
      <Lock className="mx-auto h-5 w-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{t('wizard.pictures.locked')}</p>
      <Button type="button" variant="outline" size="sm" onClick={onLogin}>
        {t('wizard.pictures.login')}
      </Button>
    </div>
  );
}

/** Last step of the wizard: cover and site plan, the preview next to it shows them at once. */
export function WizardPictures({
  isGuest,
  onLogin,
  kind,
}: {
  isGuest: boolean;
  onLogin: () => void;
  kind?: ItemKind;
}) {
  const { t } = useTranslation('organizer');
  const { setValue, watch } = useFormContext();
  const template = watch('coverTemplate') as string | undefined;
  const coverImage = watch('coverImageFile') as File | undefined;
  const mapImage = watch('eventMapImageFile') as File | undefined;
  // The picture of the chosen kind of bazaar first
  const suggested = kind ? coverForKind(kind) : undefined;
  const covers = [...EVENT_COVERS].sort((a, b) => +(b === suggested) - +(a === suggested));

  const chooseOwnCover = (files: File[]) => {
    setValue('coverImageFile', files[0], { shouldDirty: true });
    // An own picture replaces the template; removing it goes back to "none"
    setValue('coverTemplate', undefined, { shouldDirty: true });
  };

  return (
    <div className="space-y-6 rounded-lg border bg-card p-4 sm:p-5">
      <div>
        <h3 className="text-lg font-semibold">{t('wizard.pictures.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('wizard.pictures.intro')}</p>
      </div>

      <div className="space-y-3">
        <div>
          <p className="font-medium">{t('wizard.pictures.cover')}</p>
          <p className="text-xs text-muted-foreground">{t('wizard.pictures.coverText')}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {covers.map((id) => {
            const active = !coverImage && template === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                aria-label={t('wizard.pictures.coverPick', {
                  name: t(`wizard.pictures.names.${id}`),
                })}
                disabled={!!coverImage}
                // A second click takes the picture away again
                onClick={() =>
                  setValue('coverTemplate', active ? undefined : id, { shouldDirty: true })
                }
                className={cn(
                  'relative overflow-hidden rounded-md border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40',
                  active ? 'border-primary' : 'border-transparent hover:border-primary/50'
                )}
              >
                <img
                  src={coverUrl(id)}
                  alt=""
                  loading="lazy"
                  className="aspect-video w-full object-cover"
                />
                {active && (
                  <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          <Label>{t('wizard.pictures.own')}</Label>
          {isGuest ? (
            <LoginForUpload onLogin={onLogin} />
          ) : (
            <ImageUpload
              onFilesChange={chooseOwnCover}
              initialFiles={coverImage ? [coverImage] : undefined}
              maxFiles={1}
            />
          )}
        </div>
      </div>

      <div className="space-y-3 border-t pt-5">
        <div>
          <p className="font-medium">{t('wizard.pictures.map')}</p>
          <p className="text-xs text-muted-foreground">{t('wizard.pictures.mapText')}</p>
        </div>
        {isGuest ? (
          <LoginForUpload onLogin={onLogin} />
        ) : (
          <ImageUpload
            onFilesChange={(files) =>
              setValue('eventMapImageFile', files[0], { shouldDirty: true })
            }
            initialFiles={mapImage ? [mapImage] : undefined}
            maxFiles={1}
          />
        )}
      </div>
    </div>
  );
}
