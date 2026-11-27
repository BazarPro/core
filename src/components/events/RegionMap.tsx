import { Map as MapIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { StorageImage } from '../ui/StorageImage';
import type { Id } from '../../lib/api/types';
import { cn } from '../../lib/utils';
import { REGION_IMAGE_HEIGHT, REGION_IMAGE_WIDTH } from '../../lib/regionImage';

type RegionMapProps = {
  image?: Id<'_storage'>;
  /** "Nur aus PLZ 89…, 7322…", shown with the large map */
  codes?: string;
};

/**
 * "Nur aus der Region" for a bazaar for its region (#304), followed by a visible
 * "Karte ansehen" that opens the map: a map says more than "PLZ 890…, 893…" to someone who
 * does not know the codes. The picture was drawn when the organizer saved the region;
 * without one, only the text (then with the codes).
 */
export function RegionMapLink({
  children,
  image,
  codes,
  className,
}: RegionMapProps & { children: ReactNode; className?: string }) {
  const { t } = useTranslation('events');
  const [open, setOpen] = useState(false);
  if (!image) return <>{children}</>;
  return (
    <>
      {children}
      <span aria-hidden> · </span>
      <button
        type="button"
        onClick={(event) => {
          // Cards are links as a whole
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm font-medium underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
      >
        <MapIcon className="h-3.5 w-3.5 shrink-0" />
        {t('registration.showRegionMap')}
      </button>
      <RegionMapDialog open={open} onOpenChange={setOpen} image={image} codes={codes} />
    </>
  );
}

function RegionMapDialog({
  open,
  onOpenChange,
  image,
  codes,
}: RegionMapProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: Id<'_storage'>;
}) {
  const { t } = useTranslation('events');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('registration.regionMapTitle')}</DialogTitle>
          {codes && <DialogDescription>{codes}</DialogDescription>}
        </DialogHeader>
        <RegionMapImage
          image={image}
          className="block aspect-[8/5] h-auto w-full rounded-md border bg-muted"
        />
        <p className="text-xs text-muted-foreground">{t('registration.regionMapCaption')}</p>
      </DialogContent>
    </Dialog>
  );
}

/** The map itself, e.g. shown at once to a seller from outside the region. */
export function RegionMapImage({
  image,
  className,
}: {
  image?: Id<'_storage'>;
  className?: string;
}) {
  const { t } = useTranslation('events');
  if (!image) return null;
  return (
    <StorageImage
      storageId={image}
      alt={t('registration.regionMap')}
      width={REGION_IMAGE_WIDTH}
      height={REGION_IMAGE_HEIGHT}
      className={
        className ?? 'block aspect-[8/5] h-auto w-full max-w-sm rounded-md border bg-muted'
      }
    />
  );
}
