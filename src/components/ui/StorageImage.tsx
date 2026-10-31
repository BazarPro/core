import { usePublicQuery } from '../../hooks/usePublicQuery';
import React from 'react';
import { api } from '../../lib/api/functions';
import type { Id } from '../../lib/api/types';
import i18n from '../../i18n';
import { Skeleton } from './skeleton';

interface StorageImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  storageId: Id<'_storage'>;
}

export function StorageImage({ storageId, ...props }: StorageImageProps) {
  const imageUrls = usePublicQuery(api.products.getImageUrls, { storageIds: [storageId] });

  if (imageUrls === undefined) {
    return <Skeleton className={props.className} style={props.style} />;
  }

  const imageUrl = imageUrls[0];

  if (!imageUrl) {
    return <img src="/placeholder-image.png" alt={i18n.t('imageMissing')} {...props} />;
  }

  return <img src={imageUrl} {...props} />;
}
