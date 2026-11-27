import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { useState } from 'react';
import { useMutation, useApiClient, useQuery, useAuthActions } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';
import { Button } from '../../../components/ui/button';
import { Download, ShieldAlert, Trash2 } from 'lucide-react';
import { FormSection } from '../../../components/ui/form-section';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '../../../components/ui/checkbox';
import { PastEventsHandover } from '../../../components/account/PastEventsHandover';

export function DangerZoneCard() {
  const { t } = useTranslation('account');
  const client = useApiClient();

  // Hooks for Data Export
  const [isExporting, setIsExporting] = useState(false);

  // Hooks for Account Deletion
  const userId = useQuery(api.users.viewer);
  if (!userId) throw new Error('Not authenticated');

  const { signOut } = useAuthActions();

  const deleteAccount = useMutation(api.users.setDeleted);
  const deletionInfo = useQuery(api.users.getAccountDeletionInfo, {});

  const [isDeleting, setIsDeleting] = useState(false);
  const [immediately, setImmediately] = useState(false);
  const [settlementExported, setSettlementExported] = useState(false);
  const pastEvents = deletionInfo?.pastOrganizedEvents ?? [];

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const exportData = await client.query(api.users.getExportData);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bazarpro-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t('danger.exported'));
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(t('danger.exportFailed'), {
        description: getUserFacingErrorMessage(error),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      // The server checks organizer roles and removes seller/co-organizer roles atomically
      await deleteAccount({ immediately, settlementExported });
      await signOut();
      toast.success(t('danger.deleted'));
    } catch (error) {
      console.error('Deletion failed:', error);
      const message = getUserFacingErrorMessage(error, {
        messageMap: {
          ACCOUNT_IS_ORGANIZER: t('danger.isOrganizer'),
          ACCOUNT_HAS_OPEN_SALES: t('danger.hasOpenSales'),
          ACCOUNT_IS_LAST_ADMIN: t('danger.isLastAdmin'),
          ACCOUNT_ORGANIZES_PAST_EVENTS: t('danger.organizesPastEvents'),
        },
      });
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <FormSection
      icon={ShieldAlert}
      tone="destructive"
      title={t('danger.title')}
      info={t('danger.intro')}
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          variant="outline"
          onClick={handleExportData}
          disabled={isExporting}
          className="sm:flex-none"
        >
          <Download className="mr-2 h-4 w-4" />
          {isExporting ? t('danger.exporting') : t('danger.export')}
        </Button>

        <ConfirmDialog
          trigger={
            <Button
              variant="outline"
              // Red only in the dialog that confirms it: here it is one choice among others
              // dark:border-… as the outline variant sets its own border in the dark theme
              className="border-destructive/60 text-destructive hover:bg-danger-soft hover:text-danger-soft-foreground dark:border-destructive/60 sm:flex-none"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('danger.delete')}
            </Button>
          }
          title={t('danger.confirmTitle')}
          description={t('danger.confirmText', { count: deletionInfo?.graceDays ?? 30 })}
          confirmLabel={isDeleting ? t('danger.deleting') : t('danger.confirm')}
          loading={isDeleting}
          onConfirm={handleDeleteAccount}
          disabled={pastEvents.length > 0 && !settlementExported}
          destructive
        >
          <PastEventsHandover
            events={pastEvents}
            exported={settlementExported}
            onExportedChange={setSettlementExported}
          />
          <div className="flex items-start gap-2 text-sm">
            <Checkbox
              id="delete-immediately"
              checked={immediately}
              onCheckedChange={(checked) => setImmediately(!!checked)}
            />
            <label htmlFor="delete-immediately" className="leading-snug">
              {t('danger.immediately')}
            </label>
          </div>
        </ConfirmDialog>
      </div>
    </FormSection>
  );
}
