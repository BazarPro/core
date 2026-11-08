import { api } from '../lib/api/functions';
import { useQuery } from '../lib/api/react';
import type { Id } from '../lib/api/types';
import { useDisconnected } from '../lib/offlineMode';
import { HELPER_PERMISSIONS, type HelperPermission } from '../shared/constants';

/** What the signed-in user may do at a bazaar; the backend checks the same again. */
export function useEventAccess(eventId: Id<'events'>) {
  const roles = useQuery(api.eventRoles.getMyRolesForEvent, { eventId });
  const permissions = useQuery(api.eventRoles.getMyPermissionsForEvent, { eventId });
  const viewer = useQuery(api.users.viewer);
  // Offline on a copy from before helper permissions (or one without them): the roles
  // decide, as they did then; the backend refuses what is not allowed once online
  const disconnected = useDisconnected();
  const isOrganizer = (roles ?? []).includes('organizer');
  const canManage = isOrganizer || (roles ?? []).includes('coorganizer');
  const allowed: readonly HelperPermission[] | undefined =
    permissions ?? (disconnected && canManage ? HELPER_PERMISSIONS : undefined);
  return {
    /** Still loading: not known yet whether the user may be here */
    isLoading: roles === undefined || (allowed === undefined && !disconnected),
    isOrganizer,
    /** Organizer or helper: runs the bazaar */
    canManage,
    /** Writing to all sellers and appointing helpers: not for helpers themselves */
    canLead: isOrganizer || viewer?.systemRole === 'admin',
    /** What the organizer allows the helper (#47); organizers and admins may do everything */
    can: (permission: HelperPermission) => (allowed ?? []).includes(permission),
  };
}
