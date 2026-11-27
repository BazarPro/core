import { Eye, QrCode, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { downloadEventQr } from '../../lib/eventQrImage';
import { getSiteUrl } from '../../lib/seo';
import { Button } from '../ui/button';

/**
 * The public page of a bazaar for its organizer: open it, share its link, or download its
 * QR code for posters. On phones the icons only, so they stay beside the title.
 */
export function EventShareActions({ eventId, title }: { eventId: string; title: string }) {
  const { t } = useTranslation('organizer');
  const navigate = useNavigate();
  const location = useLocation();
  const [saving, setSaving] = useState(false);
  const url = `${getSiteUrl()}/public-events/${eventId}`;

  const share = async () => {
    if (!navigator.share) {
      try {
        await navigator.clipboard.writeText(url);
        toast.success(t('linkCopied', { ns: 'common' }));
      } catch {
        toast.error(url);
      }
      return;
    }
    try {
      await navigator.share({ title, url });
    } catch {
      // Closed the share sheet
    }
  };

  const downloadQr = async () => {
    setSaving(true);
    try {
      await downloadEventQr(url, title);
    } catch {
      toast.error(t('dashboard.qrFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          navigate(`/public-events/${eventId}`, {
            state: { from: `${location.pathname}${location.search}` },
          })
        }
        aria-label={t('dashboard.publicView')}
      >
        <Eye className="size-4" />
        <span>{t('dashboard.publicView')}</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void share()}
        aria-label={t('share', { ns: 'common' })}
        title={t('share', { ns: 'common' })}
      >
        <Share2 className="size-4" />
        {/* Symbols only on phones: the three buttons fit one row, "QR-Code" no longer wraps alone */}
        <span className="max-sm:sr-only md:max-lg:sr-only">{t('share', { ns: 'common' })}</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        loading={saving}
        onClick={() => void downloadQr()}
        aria-label={t('dashboard.qrDownload')}
        title={t('dashboard.qrDownload')}
      >
        <QrCode className="size-4" />
        <span className="max-sm:sr-only md:max-lg:sr-only">{t('dashboard.qrShort')}</span>
      </Button>
    </div>
  );
}
