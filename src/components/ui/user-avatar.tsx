import { useState } from 'react';
import { User } from 'lucide-react';
import { cn } from '../../lib/utils';

interface UserAvatarProps {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  alt?: string;
  className?: string;
}

/** Up to two letters: first and last word of the name, else the start of the email. */
function initials(name?: string | null, email?: string | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  const local = (email ?? '').trim().split('@')[0];
  return local ? local[0].toUpperCase() : '';
}

/**
 * Round profile picture. Falls back to the initials when there is no picture or it
 * does not load. Google and GitHub refuse their pictures to some referrers (e.g. the
 * app's WebView), hence `no-referrer`.
 */
export function UserAvatar({ name, email, image, alt, className }: UserAvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const letters = initials(name, email);
  const showImage = !!image && failed !== image;

  return (
    <span
      className={cn(
        'relative inline-flex size-8 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary',
        className
      )}
    >
      {showImage ? (
        <img
          src={image}
          alt={alt ?? ''}
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailed(image)}
        />
      ) : letters ? (
        <span aria-hidden>{letters}</span>
      ) : (
        <User className="size-1/2" aria-hidden />
      )}
    </span>
  );
}
