import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthState, useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
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
import { Trans, useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('events');
  const navigate = useNavigate();
  const actionRef = useRef<'createNew' | 'addExisting' | null>(null);
  const { isAuthenticated } = useAuthState();
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
          <DialogTitle className="text-center text-2xl">{t('registered.title')}</DialogTitle>
          <DialogDescription className="text-center">
            <Trans
              i18nKey="registered.text"
              ns="events"
              values={{ event: eventTitle }}
              components={{ strong: <strong /> }}
            />
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
                <div className="font-semibold">{t('registered.addExisting')}</div>
                <div className="text-xs text-muted-foreground">
                  {t('registered.addExistingHint')}
                </div>
              </div>
            </Button>
          ) : (
            <div className="p-4 bg-muted rounded-lg text-sm text-center italic">
              {t('registered.noProducts')}
            </div>
          )}

          <Button className="h-auto py-4 px-4 justify-start gap-4" onClick={handleCreateNew}>
            <PlusCircle className="h-6 w-6" />
            <div className="text-left">
              <div className="font-semibold">{t('registered.createNew')}</div>
              <div className="text-xs opacity-90">{t('registered.createNewHint')}</div>
            </div>
          </Button>
        </div>

        <DialogFooter className="sm:justify-center">
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            {t('registered.later')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
