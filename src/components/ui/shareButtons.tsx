import { Share2 } from 'lucide-react';
import { Button } from './button';
interface ShareButtonsProps {
  url: string;
  title: string;
  description?: string;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'link';
}

export function ShareButtons({
  url,
  title,
  description,
  className = '',
  variant = 'default',
}: ShareButtonsProps) {
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: description || title,
          url,
        });
      } catch (error) {
        // User cancelled or error occurred
        console.log('Share cancelled', error);
      }
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {
        <Button
          onClick={handleNativeShare}
          variant={variant}
          className="flex w-full"
          aria-label="Teilen"
          title="Teilen"
        >
          <Share2 className="size-4" />
        </Button>
      }
    </div>
  );
}
