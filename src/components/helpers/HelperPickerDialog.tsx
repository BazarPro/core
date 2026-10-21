import { useMemo, useState } from 'react';
import { Search, UserPlus } from 'lucide-react';
import type { VendorWithCalculations } from '../../lib/api/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { SellerNumberBadge } from '../sellers/SellerNumberBadge';
import { useTranslation } from 'react-i18next';

const MAX_SHOWN = 50;

/**
 * Picks the participant who becomes a helper. Helpers need an account and must be
 * registered for the bazaar; walk-in sellers, the owner and current helpers are left out.
 */
export function HelperPickerDialog({
  vendors,
  ownerId,
  open,
  onOpenChange,
  onPick,
}: {
  vendors: VendorWithCalculations[];
  ownerId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (vendor: VendorWithCalculations) => void;
}) {
  const { t } = useTranslation('organizer');
  const [search, setSearch] = useState('');
  const candidates = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return vendors.filter(
      (v) =>
        !v.isHelper &&
        !v.managedByEventId &&
        v._id !== ownerId &&
        (!lower ||
          v.name?.toLowerCase().includes(lower) ||
          v.email?.toLowerCase().includes(lower) ||
          String(v.sellerNumber ?? '') === lower)
    );
  }, [vendors, ownerId, search]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('sellers.addHelper')}</DialogTitle>
          <DialogDescription>{t('helperPicker.text')}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            placeholder={t('sellers.search')}
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {candidates.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('helperPicker.none')}</p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
            {candidates.slice(0, MAX_SHOWN).map((v) => (
              <li key={v._id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    setSearch('');
                    onPick(v);
                  }}
                >
                  <UserPlus className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className="truncate">{v.name}</span>
                      <SellerNumberBadge number={v.sellerNumber} />
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{v.email}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
