import { CalendarDays, MailX, MapPin } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EventRegistrationDialog } from '../../../components/events/EventRegistrationDialog';
import { SellerConditions } from '../../../components/events/SellerConditions';
import { Button } from '../../../components/ui/button';
import { PageSkeleton } from '../../../components/ui/loading';
import { usePublicQuery } from '../../../hooks/usePublicQuery';
import { dateLocale } from '../../../i18n/format';
import { api } from '../../../lib/api/functions';
import { useAuthActions, useAuthState, useQuery } from '../../../lib/api/react';
import { loginPath } from '../../../lib/loginRedirect';
import { formatEventPlace } from '../../../shared/eventJsonLd';

/** Where the link of an invitation mail leads: the bazaar, then signing in and accepting. */
export function InvitePage() {
  const { t } = useTranslation('events');
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthState();
  const { signOut } = useAuthActions();
  const invitation = usePublicQuery(api.eventInvitations.getByToken, { token });
  const viewer = useQuery(api.users.viewer);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (invitation === undefined) return <PageSkeleton />;

  if (!invitation) {
    return (
      <div className="mx-auto max-w-lg space-y-3 rounded-xl border bg-card p-8 text-center">
        <MailX className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="text-xl font-semibold">{t('invitation.goneTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('invitation.goneText')}</p>
      </div>
    );
  }

  const { event, email, helper } = invitation;
  const here = `/invite/${encodeURIComponent(token)}`;
  const place = formatEventPlace(event);
  const wrongAccount =
    isAuthenticated && !!viewer && viewer.email?.toLowerCase() !== email.toLowerCase();

  return (
    <div className="mx-auto max-w-lg space-y-5 rounded-xl border bg-card p-6 sm:p-8">
      <div className="space-y-2">
        <p className="text-sm font-medium text-primary">{t('invitation.heading')}</p>
        <h1 className="break-words text-2xl font-semibold">{event.title}</h1>
        <p>{helper ? t('invitation.asHelper') : t('invitation.asSeller')}</p>
      </div>
      <ul className="space-y-2 text-sm">
        <li className="flex items-start gap-2">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          {new Date(event.startDate).toLocaleString(dateLocale(), {
            dateStyle: 'full',
            timeStyle: 'short',
          })}
        </li>
        {place && (
          <li className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 break-words">{place}</span>
          </li>
        )}
      </ul>
      {!helper && <SellerConditions event={event} className="rounded-lg border bg-muted/30 p-4" />}

      {wrongAccount ? (
        <div className="space-y-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
          <p>{t('invitation.otherAccount', { account: viewer.email ?? '', email })}</p>
          <Button variant="outline" onClick={() => void signOut()}>
            {t('invitation.logout')}
          </Button>
        </div>
      ) : isAuthenticated ? (
        <Button className="w-full" size="lg" onClick={() => setDialogOpen(true)}>
          {t('invitation.accept')}
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('invitation.sentTo', { email })}</p>
          <Button asChild className="w-full" size="lg">
            <Link
              to={`/register?redirect=${encodeURIComponent(here)}&email=${encodeURIComponent(email)}`}
            >
              {t('invitation.register')}
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link to={loginPath(here)}>{t('invitation.login')}</Link>
          </Button>
        </div>
      )}

      <EventRegistrationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        eventId={event._id}
        eventTitle={event.title}
        hasAccessCode={false}
        invitation={token}
        conditions={event}
        onSuccess={() => navigate(`/public-events/${event._id}`)}
      />
    </div>
  );
}
