import type { Id } from '../../convex/_generated/dataModel';
import type { UserRole } from '../context/UserRoleContext';

const STORAGE_KEYS: Record<UserRole, string> = {
  organizer: 'lastMenuPath.organizer',
  participant: 'lastMenuPath.participant',
  administrator: 'lastMenuPath.administrator',
};

export function getMenuStorageKey(role: UserRole, eventId?: Id<'events'>) {
  if (eventId) {
    return `lastMenuPath.event.${eventId}`;
  }
  return STORAGE_KEYS[role];
}

export function saveMenuPath(role: UserRole, path: string, eventId?: Id<'events'>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getMenuStorageKey(role, eventId), path);
}

export function getLastMenuPath(role: UserRole, eventId?: Id<'events'>) {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(getMenuStorageKey(role, eventId));
}
