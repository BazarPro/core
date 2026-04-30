import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Package, PlusCircle, CheckCircle2 } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';
import { setParticipantOnboardingPending } from '../../lib/onboardingTrigger';

interface PostRegistrationSuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTitle: string;
  eventId: Id<'events'>;
}

export function PostRegistrationSuccessDialog({
  open,
  onOpenChange,
  eventTitle,
  eventId,
}: PostRegistrationSuccessDialogProps) {
  const navigate = useNavigate();
  const actionRef = useRef<'createNew' | 'addExisting' | null>(null);
  const { isAuthenticated } = useConvexAuth();
  const products = useQuery(api.products.getMyProducts, isAuthenticated ? {} : 'skip');

  const hasProducts = products && products.length > 0;

  const handleAddExisting = () => {
    actionRef.current = 'addExisting';
    setParticipantOnboardingPending();
    onOpenChange(false);
    navigate('/my-products', { state: { eventSelectEventId: eventId } });
  };

  const handleCreateNew = () => {
    actionRef.current = 'createNew';
    onOpenChange(false);
    navigate('/products/new', { state: { initialEventId: eventId } });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      actionRef.current = null;
      onOpenChange(true);
      return;
    }

    onOpenChange(false);

    if (actionRef.current === 'createNew') {
      return;
    }
    if (actionRef.current === 'addExisting') {
      return;
    }

    // User dismissed the post-registration wizard (X / outside click / escape / "Vorerst nicht").
    // In this case we trigger onboarding immediately on the participant dashboard.
    setParticipantOnboardingPending();
    navigate('/my-products', { state: { eventSelectEventId: eventId } });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <DialogTitle className="text-center text-2xl">Anmeldung erfolgreich!</DialogTitle>
          <DialogDescription className="text-center">
            Du bist nun für <strong>{eventTitle}</strong> angemeldet. Möchtest du direkt Produkte
            für dieses Event registrieren?
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {hasProducts ? (
            <Button
              variant="outline"
              className="h-auto py-4 px-4 justify-start gap-4"
              onClick={handleAddExisting}
            >
              <Package className="h-6 w-6 text-primary" />
              <div className="text-left">
                <div className="font-semibold">Vorhandene Produkte hinzufügen</div>
                <div className="text-xs text-muted-foreground">
                  Wähle aus deiner Liste bereits erstellter Produkte
                </div>
              </div>
            </Button>
          ) : (
            <div className="p-4 bg-muted rounded-lg text-sm text-center italic">
              Du hast noch keine Produkte erstellt. Erstelle dein erstes Produkt, um es für dieses
              Event anzumelden!
            </div>
          )}

          <Button className="h-auto py-4 px-4 justify-start gap-4" onClick={handleCreateNew}>
            <PlusCircle className="h-6 w-6" />
            <div className="text-left">
              <div className="font-semibold">Neues Produkt erstellen</div>
              <div className="text-xs opacity-90">
                Erstelle ein neues Produkt und melde es direkt an
              </div>
            </div>
          </Button>
        </div>

        <DialogFooter className="sm:justify-center">
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Vorerst nicht, danke
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
