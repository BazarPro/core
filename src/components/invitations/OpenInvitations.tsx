import { Mail, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../../lib/api/functions';
import { useMutation, useQuery } from '../../lib/api/react';
import type { Id } from '../../lib/api/types';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

/** Who was invited and has not answered yet. Shows nothing without open invitations. */
export function OpenInvitations({ eventId }: { eventId: Id<'events'> }) {
  const { t } = useTranslation('organizer');
  const invitations = useQuery(api.eventInvitations.listOpen, { eventId });
  const revoke = useMutation(api.eventInvitations.revoke);
  if (!invitations?.length) return null;

  const withdraw = async (invitationId: Id<'eventInvitations'>) => {
    try {
      await revoke({ eventId, invitationId });
      toast.success(t('sellers.invitationRevoked'));
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    }
  };

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{t('sellers.invitations')}</h2>
      <ul className="divide-y rounded-xl border bg-card">
        {invitations.map((invitation) => (
          <li key={invitation._id} className="flex items-center gap-3 p-3 text-sm">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 break-all">{invitation.email}</span>
            <Badge variant="outline" className="shrink-0">
              {invitation.helper ? t('sellers.invitationHelper') : t('sellers.invitationSeller')}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground"
              title={t('sellers.revokeInvitation')}
              aria-label={t('sellers.revokeInvitation')}
              onClick={() => void withdraw(invitation._id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
