import { useState } from 'react';
import { useApiClient } from '../../../../../lib/api/react';
import { FileDown, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api } from '../../../../../lib/api/functions';
import type { Id } from '../../../../../lib/api/types';
import { Button } from '../../../../../components/ui/button';
import { getUserFacingErrorMessage } from '../../../../../lib/errors';
import {
  downloadProofOfOffersCsv,
  downloadProofOfOffersPdf,
} from '../../../../../lib/proofOfOffersPdf';

/**
 * Download of who offered which item, e.g. for the police after a bike market. Loads
 * the data on click, so the file always has the latest state.
 */
export function ProofOfOffersCard({ eventId }: { eventId: Id<'events'> }) {
  const { t } = useTranslation('organizer');
  const client = useApiClient();
  const [busy, setBusy] = useState(false);

  const download = async (format: 'pdf' | 'csv') => {
    setBusy(true);
    try {
      const proof = await client.query(api.sellerRecords.getProofOfOffers, { eventId });
      if (format === 'pdf') downloadProofOfOffersPdf(proof);
      else downloadProofOfOffersCsv(proof);
    } catch (error) {
      toast.error(t('proof.failed'), { description: getUserFacingErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck className="h-5 w-5 text-muted-foreground" /> {t('proof.cardTitle')}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">{t('proof.cardText')}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="gap-2" disabled={busy} onClick={() => download('pdf')}>
          <FileDown className="h-4 w-4" /> {t('proof.pdf')}
        </Button>
        <Button variant="outline" className="gap-2" disabled={busy} onClick={() => download('csv')}>
          <FileSpreadsheet className="h-4 w-4" /> {t('proof.csv')}
        </Button>
      </div>
    </section>
  );
}
