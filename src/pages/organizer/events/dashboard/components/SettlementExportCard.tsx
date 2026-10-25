import { useState } from 'react';
import { useApiClient } from '../../../../../lib/api/react';
import { Archive, FileDown, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api } from '../../../../../lib/api/functions';
import type { Id } from '../../../../../lib/api/types';
import { Button } from '../../../../../components/ui/button';
import { getUserFacingErrorMessage } from '../../../../../lib/errors';
import { downloadSettlementCsv, downloadSettlementPdf } from '../../../../../lib/settlementExport';

/**
 * Download of the settlement for the organizers' records (§ 147 AO). Loads the data on
 * click, so the file always has the latest state.
 */
export function SettlementExportCard({ eventId }: { eventId: Id<'events'> }) {
  const { t } = useTranslation('organizer');
  const client = useApiClient();
  const [busy, setBusy] = useState(false);

  const download = async (format: 'pdf' | 'sellers' | 'sales') => {
    setBusy(true);
    try {
      const settlement = await client.query(api.settlement.getExport, { eventId });
      if (format === 'pdf') await downloadSettlementPdf(settlement);
      else await downloadSettlementCsv(settlement, format);
    } catch (error) {
      toast.error(t('export.failed'), { description: getUserFacingErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <Archive className="h-5 w-5 text-muted-foreground" /> {t('export.cardTitle')}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">{t('export.cardText')}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="gap-2" disabled={busy} onClick={() => download('pdf')}>
          <FileDown className="h-4 w-4" /> {t('export.pdf')}
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          disabled={busy}
          onClick={() => download('sellers')}
        >
          <FileSpreadsheet className="h-4 w-4" /> {t('export.csvSellers')}
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          disabled={busy}
          onClick={() => download('sales')}
        >
          <FileSpreadsheet className="h-4 w-4" /> {t('export.csvSales')}
        </Button>
      </div>
    </section>
  );
}
