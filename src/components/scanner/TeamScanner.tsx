import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { api } from '../../lib/api/functions';
import { useApiClient, useQuery } from '../../lib/api/react';
import type { Id } from '../../lib/api/types';
import { sellerOfId } from '../../lib/checkInCode';
import { productIdFromCode } from '../../lib/checkout';
import { isNetworkError } from '../../lib/offlineMode';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { QRCodeScanner } from '../ui/QRCodeScanner';

/** The same code stays in front of the camera for a moment */
const REPEAT_SCAN_MS = 2500;
const DESKTOP_WIDTH = 1024;

/**
 * The team's scanner, from the header and the items page: fills the phone's screen, a
 * dialog on the desktop. A seller's ID or an item's label leads to its page.
 */
export function TeamScanner({
  eventId,
  open,
  onOpenChange,
}: {
  eventId: Id<'events'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('organizer');
  const client = useApiClient();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const vendors = useQuery(api.eventRoles.getVendorsForEvent, open ? { eventId } : 'skip');
  const busy = useRef(false);
  const lastScan = useRef<{ code: string; at: number } | null>(null);

  const productsPath = `/events/view/${eventId}/products`;

  const finish = (path: string, message?: string) => {
    onOpenChange(false);
    setCode('');
    navigate(path);
    if (message) toast.success(message);
  };

  const findSeller = (id: string, name?: string | null) =>
    finish(
      `${productsPath}?vendor=${encodeURIComponent(id)}`,
      t('products.sellerFound', {
        name: name ?? vendors?.find((vendor) => vendor._id === id)?.name ?? '',
      })
    );

  const process = async (input: string) => {
    const value = input.trim();
    const now = Date.now();
    if (!value || busy.current) return;
    if (lastScan.current?.code === value && now - lastScan.current.at < REPEAT_SCAN_MS) return;
    lastScan.current = { code: value, at: now };
    busy.current = true;
    try {
      const seller = await sellerOfId(client, eventId, value);
      if (seller === 'unknown') {
        toast.error(t('products.idUnknownOffline'));
        return;
      }
      if (seller) {
        findSeller(seller.id, seller.name);
        return;
      }
      const productId = productIdFromCode(value);
      if (productId) {
        const path = `${productsPath}?q=${encodeURIComponent(productId)}`;
        try {
          const item = await client.query(api.purchases.getCheckoutItem, { eventId, productId });
          if (item) finish(path, t('products.productFound', { title: item.title }));
          else toast.error(t('products.scanUnknown'));
        } catch (error) {
          // Without internet the items page still has its copy
          if (!isNetworkError(error)) throw error;
          finish(path);
        }
        return;
      }
      // Could still be a seller's token without the protocol
      const user = await client
        .query(api.users.getUserByCheckInToken, { token: value, eventId })
        .catch(() => null);
      if (user) findSeller(user._id, user.name);
      else toast.error(t('products.scanUnknown'));
    } catch {
      toast.error(t('products.scanUnknown'));
    } finally {
      busy.current = false;
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    lastScan.current = null;
    void process(code);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        // A hand scanner types into the field on a desk; a phone must not open its keyboard
        onOpenAutoFocus={(event) => {
          if (window.innerWidth < DESKTOP_WIDTH) event.preventDefault();
        }}
        className="sm:max-w-md max-lg:inset-0 max-lg:left-0 max-lg:top-0 max-lg:block max-lg:h-dvh max-lg:max-w-none max-lg:translate-x-0 max-lg:translate-y-0 max-lg:overflow-hidden max-lg:rounded-none max-lg:border-0 max-lg:bg-black max-lg:p-0 max-lg:text-white max-lg:duration-0 max-lg:[&>button:last-child]:right-2 max-lg:[&>button:last-child]:top-[calc(0.5rem+env(safe-area-inset-top))] max-lg:[&>button:last-child]:z-30 max-lg:[&>button:last-child]:flex max-lg:[&>button:last-child]:size-11 max-lg:[&>button:last-child]:items-center max-lg:[&>button:last-child]:justify-center max-lg:[&>button:last-child]:rounded-full max-lg:[&>button:last-child]:bg-black/50 max-lg:[&>button:last-child]:opacity-100 max-lg:[&>button:last-child>svg]:size-6"
      >
        <DialogTitle className="max-lg:absolute max-lg:left-4 max-lg:top-[calc(1rem+env(safe-area-inset-top))] max-lg:z-20 max-lg:text-white max-lg:drop-shadow">
          {t('scanner.title')}
        </DialogTitle>
        {open && <QRCodeScanner onScanSuccess={(value) => void process(value)} fullOnPhones />}
        <form
          onSubmit={submit}
          className="flex gap-2 max-lg:absolute max-lg:inset-x-4 max-lg:bottom-[calc(1rem+env(safe-area-inset-bottom))] max-lg:z-20"
        >
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder={t('scanner.placeholder')}
            aria-label={t('scanner.manual')}
            className="max-lg:border-white/30 max-lg:bg-black/60 max-lg:text-white max-lg:placeholder:text-white/70"
          />
          <Button
            type="submit"
            variant="secondary"
            size="icon"
            className="shrink-0"
            aria-label={t('scanner.process')}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
