import type {
  ProductContitions,
  EventProductStatus,
  EventVisibility,
} from '../../convex/constants';

export const CONDITION_OPTIONS: Record<ProductContitions, { title: string; description: string }> =
  {
    new: {
      title: 'Neu',
      description: 'Dieser Artikel ist neu und unbenutzt.',
    },
    'very-good': {
      title: 'Gebraucht, wie neu',
      description: 'Dieser Artikel ist benutzt aber weist keine Gebrauchsspuren auf.',
    },

    good: {
      title: 'Gebraucht',
      description: 'Der Artikel ist benutzt und weist sichtbare Gebrauchsspuren auf.',
    },

    ok: {
      title: 'Gebraucht mit Mängeln',
      description: 'Der Artikel weißt sichtbare Mängel auf.',
    },
  };

export const STATUS_OPTIONS: Record<EventProductStatus, { title: string; description: string }> = {
  announced: {
    title: 'Angemeldet',
    description: 'Dieser Artikel wurde auf der Veranstaltung angemeldet.',
  },
  available: {
    title: 'Erhältlich',
    description: 'Dieser Artikel wurde vor Ort gescannt und kann gekauft werden.',
  },

  sold: {
    title: 'Verkauft',
    description: 'Der Artikel wurde bereits verkauft.',
  },

  returned: {
    title: 'Zurückgegeben',
    description: 'Der Artikel wurde nicht verkauft und dem Verkäufer ausgehändigt.',
  },
};

export const VISIBILITY_OPTIONS: Record<EventVisibility, { title: string; description: string }> = {
  public: {
    title: 'Öffentlich',
    description: 'Jeder kann Angebote sehen',
  },
  'logged-in': {
    title: 'Nur eingelogge Nutzer',
    description: 'Angebote sind nur nach Login sichtbar',
  },
  approved: {
    title: 'Nur Freigeschaltene Benutzer',
    description: 'Nur Nutzer mit expliziter Freischaltung können sehen',
  },
};

/**
 * Auszahlungsstatus für Verkäufer am Event (Convex: eventSeller.payoutReceived bzw.
 * getVendorsForEvent.paid). Kein Schema-Union wie bei Produktstatus — nur abgeleitet aus boolean.
 */
export const VENDOR_PAYOUT_STATUS_OPTIONS = {
  paid: {
    title: 'Ausbezahlt',
    description: 'Die Auszahlung wurde in der Abrechnung als erfolgt markiert.',
    badgeVariant: 'default' as const,
  },
  pending: {
    title: 'Ausstehend',
    description: 'Die Auszahlung an den Verkäufer steht noch aus.',
    badgeVariant: 'outline' as const,
  },
} as const;

export function vendorPayoutStatusFromPaid(paid: boolean) {
  return paid ? VENDOR_PAYOUT_STATUS_OPTIONS.paid : VENDOR_PAYOUT_STATUS_OPTIONS.pending;
}
