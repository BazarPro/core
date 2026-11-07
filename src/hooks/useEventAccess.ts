import { api } from '../lib/api/functions';
import { useQuery } from '../lib/api/react';
import type { Id } from '../lib/api/types';
import type { HelperPermission } from '../shared/constants';

/** What the signed-in user may do at a bazaar; the backend checks the same again. */
export function useEventAccess(eventId: Id<'events'>) {
  const roles = useQuery(api.eventRoles.getMyRolesForEvent, { eventId });
  const permissions = useQuery(api.eventRoles.getMyPermissionsForEvent, { eventId });
  const viewer = useQuery(api.users.viewer);
  const isOrganizer = (roles ?? []).includes('organizer');
  return {
    /** Still loading: not known yet whether the user may be here */
    isLoading: roles === undefined || permissions === undefined,
    isOrganizer,
    /** Organizer or helper: runs the bazaar */
    canManage: isOrganizer || (roles ?? []).includes('coorganizer'),
    /** Writing to all sellers and appointing helpers: not for helpers themselves */
    canLead: isOrganizer || viewer?.systemRole === 'admin',
    /** What the organizer allows the helper (#47); organizers and admins may do everything */
    can: (permission: HelperPermission) => (permissions ?? []).includes(permission),
  };
}
