import { Link } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

/** Reminds administrators that they manage someone else's event. */
export function AdminEventBanner({ event }: { event: Pick<Doc<'events'>, 'organizerId'> }) {
  const viewer = useQuery(api.users.viewer);
  if (!viewer || viewer.systemRole !== 'admin' || viewer._id === event.organizerId) return null;
  return (
    <Alert variant="warning" className="mb-6" data-testid="admin-event-banner">
      <ShieldCheck className="h-4 w-4" />
      <AlertTitle>Admin-Modus</AlertTitle>
      <AlertDescription>
        <p>
          Du verwaltest diese Veranstaltung als Administrator mit allen Rechten des Veranstalters.
          Änderungen wirken sofort.{' '}
          <Link to="/admin/events" className="font-medium underline">
            Zur Admin-Eventliste
          </Link>
        </p>
      </AlertDescription>
    </Alert>
  );
}
