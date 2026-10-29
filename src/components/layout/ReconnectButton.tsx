import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useApiClient } from '../../lib/api/react';
import { Button } from '../ui/button';

/**
 * "Neu verbinden" while offline: connects at once instead of after the backoff (up to
 * 30 s). Once connected, the waiting queues of intake and cash desk are sent on their own.
 */
export function ReconnectButton({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const client = useApiClient();
  const [connecting, setConnecting] = useState(false);

  const reconnect = async () => {
    setConnecting(true);
    try {
      if (!(await client.reconnectNow())) toast.error(t('reconnectFailed'));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className={`h-8 gap-1.5 bg-background/60 ${className}`}
      disabled={connecting}
      onClick={() => void reconnect()}
    >
      <RefreshCw className={connecting ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
      {t('reconnect')}
    </Button>
  );
}
