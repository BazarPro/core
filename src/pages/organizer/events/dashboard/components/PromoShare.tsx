import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { Copy, Facebook, Mail, Send, Share2 } from 'lucide-react';
import { Button } from '../../../../../components/ui/button';
import { saveFile } from '../../../../../lib/saveFile';

/**
 * Sharing from the promo page. The picture itself goes through the share sheet of the
 * device (WhatsApp, Instagram, Facebook … as installed); on computers without one, the
 * link to the bazaar goes to the networks as a plain link. Nothing of the networks is
 * loaded before a click (privacy policy: "Teilen").
 */

function canShareFiles(file: File | null): boolean {
  if (Capacitor.isNativePlatform()) return true;
  if (!file || typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function PromoShare({
  makeFile,
  url,
  text,
}: {
  /** The file of the current format, made when needed */
  makeFile: () => Promise<File>;
  url: string;
  /** Text to go with the link, e.g. "Kinderbasar am Samstag" */
  text: string;
}) {
  const { t } = useTranslation('organizer');
  const [busy, setBusy] = useState(false);
  // A dummy file tells whether this browser shares files at all
  const fileSharing = canShareFiles(new File([''], 'x.png', { type: 'image/png' }));

  const shareFile = async () => {
    setBusy(true);
    try {
      const file = await makeFile();
      if (Capacitor.isNativePlatform()) {
        await saveFile(file, file.name);
      } else {
        await navigator.share({ files: [file], title: text, text: `${text}\n${url}` });
      }
    } catch (error) {
      // Closing the share sheet is no error
      if ((error as Error)?.name !== 'AbortError') toast.error(t('promo.share.failed'));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success(t('promo.share.copied'));
  };

  const message = `${text}\n${url}`;
  const links = [
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      icon: Send,
      href: `https://wa.me/?text=${encodeURIComponent(message)}`,
    },
    {
      id: 'facebook',
      label: 'Facebook',
      icon: Facebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
    {
      id: 'telegram',
      label: 'Telegram',
      icon: Send,
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    },
    {
      id: 'mail',
      label: t('promo.share.mail'),
      icon: Mail,
      href: `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(message)}`,
    },
  ];

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Share2 className="size-4" />
        {t('promo.share.title')}
      </h2>
      {fileSharing ? (
        <>
          <Button variant="outline" className="w-full" onClick={shareFile} disabled={busy}>
            <Share2 className="size-4 mr-2" />
            {t('promo.share.file')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('promo.share.fileHint')}</p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{t('promo.share.noFileSharing')}</p>
      )}
      <div>
        <p className="text-xs text-muted-foreground mb-2">{t('promo.share.linkHint')}</p>
        <div className="flex flex-wrap gap-2">
          {links.map(({ id, label, icon: Icon, href }) => (
            <Button key={id} variant="secondary" size="sm" asChild>
              <a href={href} target="_blank" rel="noopener noreferrer">
                <Icon className="size-4 mr-1" />
                {label}
              </a>
            </Button>
          ))}
          <Button variant="secondary" size="sm" onClick={copy}>
            <Copy className="size-4 mr-1" />
            {t('promo.share.copy')}
          </Button>
        </div>
      </div>
    </div>
  );
}
