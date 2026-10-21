import { usePublicQuery } from '../../hooks/usePublicQuery';
import React from 'react';
import { api } from '../../lib/api/functions';
import type { Id } from '../../../convex/_generated/dataModel';
import i18n from '../../i18n';

interface ConvexImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  storageId: Id<'_storage'>;
}

export function ConvexImage({ storageId, ...props }: ConvexImageProps) {
  const imageUrls = usePublicQuery(api.products.getImageUrls, { storageIds: [storageId] });

  if (imageUrls === undefined) {
    return <div>{i18n.t('imageLoading')}</div>;
  }

  const imageUrl = imageUrls[0];

  if (!imageUrl) {
    return <img src="/placeholder-image.png" alt={i18n.t('imageMissing')} {...props} />;
  }

  return <img src={imageUrl} {...props} />;
}
