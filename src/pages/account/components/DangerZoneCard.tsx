import { useState } from 'react';
import { useMutation, useConvex, useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useAuthActions } from '@convex-dev/auth/react';
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

export function DangerZoneCard() {
  const convex = useConvex();

  // Hooks for Data Export
  const [isExporting, setIsExporting] = useState(false);

  // Hooks for Account Deletion
  const userId = useQuery(api.users.viewer);
  if (!userId) throw new Error('Not authenticated');

  const { signOut } = useAuthActions();

  const myEvents = useQuery(api.events.getMyEvents, {});
  const deleteSellerAndCoorganizer = useMutation(api.eventSeller.removeSellerAndCoorganizerRoles);
  const deleteAccount = useMutation(api.users.setDeleted);

  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const exportData = await convex.query(api.users.getExportData);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bazarpro-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Datenexport erfolgreich gestartet');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Datenexport fehlgeschlagen.', {
        description: getUserFacingErrorMessage(error),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      if (myEvents?.length) {
        toast.error(
          'Account kann nicht gelöscht werden, da du Organisator einer Veranstaltung bist.'
        );
        setIsDeleting(false);
        return;
      }
      await deleteSellerAndCoorganizer();
      await deleteAccount();
      await signOut();
      toast.success('Konto erfolgreich gelöscht.');
    } catch (error) {
      console.error('Deletion failed:', error);
      setErrorMessage(getUserFacingErrorMessage(error));
      toast.error(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-card rounded-xl border border-destructive/20 shadow-sm overflow-hidden mb-12">
      <div className="p-6">
        <h3 className="text-lg font-medium text-destructive dark:text-red-400 mb-4">
          Datenschutz & Gefahrenzone
        </h3>
        <div className="space-y-6">
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Gemäß DSGVO hast du das Recht, eine Kopie deiner bei uns gespeicherten Daten zu
              erhalten oder dein Konto dauerhaft zu löschen.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                variant="outline"
                onClick={handleExportData}
                disabled={isExporting}
                className="flex-1 sm:flex-none"
              >
                <Download className="mr-2 h-4 w-4" />
                {isExporting ? 'Exportiere...' : 'Daten extrahieren (JSON)'}
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="flex-1 sm:flex-none">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Konto löschen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Bist du dir absolut sicher?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Deine Anmeldungen bei Veranstaltungen werden storniert und Produkte aus den
                      Veranstaltungen entfernt. Du kannst deinen Account jederzeit reaktivieren
                      musst dich jedoch neu Authentifizieren und bei Veranstaltungen anmelden.
                      Eigene Produkte bleiben Account bleiben erhalten.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={isDeleting}
                    >
                      {isDeleting ? 'Lösche...' : 'Ja, Konto löschen'}
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
