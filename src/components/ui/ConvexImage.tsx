import React from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

interface ConvexImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  storageId: Id<'_storage'>;
}

export function ConvexImage({ storageId, ...props }: ConvexImageProps) {
  const imageUrls = useQuery(api.products.getImageUrls, { storageIds: [storageId] });

  if (imageUrls === undefined) {
    return <div>Loading image...</div>; // Or a spinner
  }

  const imageUrl = imageUrls[0];

  if (!imageUrl) {
    return <img src="/placeholder-image.png" alt="Image not found" {...props} />; // Fallback image
  }

  return <img src={imageUrl} {...props} />;
}
