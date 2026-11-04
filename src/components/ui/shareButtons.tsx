import { Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './button';
import i18n from '../../i18n';

interface ShareButtonsProps {
  url: string;
  title: string;
  description?: string;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'link';
}

/** Opens the share sheet of the device; without one it copies the link. */
export function ShareButtons({
  url,
  title,
  description,
  className,
  variant = 'default',
}: ShareButtonsProps) {
  const share = async () => {
    if (!navigator.share) {
      await navigator.clipboard.writeText(url);
      toast.success(i18n.t('linkCopied'));
      return;
    }
    try {
      await navigator.share({ title, text: description || title, url });
    } catch {
      // Closed the share sheet
    }
  };

  return (
    <Button
      onClick={() => void share()}
      variant={variant}
      className={className}
      aria-label={i18n.t('share')}
      title={i18n.t('share')}
    >
      <Share2 className="size-4" />
    </Button>
  );
}
