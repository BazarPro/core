import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { Copy, Facebook, Link2, Loader2, Mail, Send, Share2 } from 'lucide-react';
import { Button } from '../../../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../../components/ui/dropdown-menu';
import { saveFile } from '../../../../../lib/saveFile';

/**
 * Sharing from the promo page. Where the device shares files (phones, the app), the
 * button shares the poster or picture itself through the share sheet (WhatsApp,
 * Instagram, Facebook … as installed). Elsewhere it cannot, so it says what it does:
 * "Link teilen" sends the link to the bazaar page. Nothing of the networks is loaded
 * before a click (privacy policy: "Teilen").
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

  if (fileSharing) {
    return (
      <Button variant="outline" size="lg" className="gap-2" onClick={shareFile} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
        {t('promo.share.file')}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="lg" className="gap-2">
          <Link2 className="size-4" />
          {t('promo.share.link')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {links.map(({ id, label, icon: Icon, href }) => (
          <DropdownMenuItem key={id} asChild>
            <a href={href} target="_blank" rel="noopener noreferrer">
              <Icon className="size-4 mr-2" />
              {label}
            </a>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => void copy()}>
          <Copy className="size-4 mr-2" />
          {t('promo.share.copy')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
