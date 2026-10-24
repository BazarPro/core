import { useState } from 'react';
import { useMutation, useApiClient, useQuery, useAuthActions } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';
import { Button } from '../../../components/ui/button';
import { Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../../components/ui/alert-dialog';
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
    <div className="bg-card rounded-xl border border-destructive/20 shadow-sm overflow-hidden mb-12">
      <div className="p-6">
        <h3 className="text-lg font-medium text-destructive dark:text-red-400 mb-4">
          {t('danger.title')}
        </h3>
        <div className="space-y-6">
          <div>
            <p className="text-sm text-muted-foreground mb-4">{t('danger.intro')}</p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                variant="outline"
                onClick={handleExportData}
                disabled={isExporting}
                className="flex-1 sm:flex-none"
              >
                <Download className="mr-2 h-4 w-4" />
                {isExporting ? t('danger.exporting') : t('danger.export')}
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="flex-1 sm:flex-none">
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('danger.delete')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('danger.confirmTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('danger.confirmText', { count: deletionInfo?.graceDays ?? 30 })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
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
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
                    <AlertDialogAction
                      loading={isDeleting}
                      onClick={handleDeleteAccount}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={isDeleting || (pastEvents.length > 0 && !settlementExported)}
                    >
                      {isDeleting ? t('danger.deleting') : t('danger.confirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
