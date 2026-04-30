import { createContext, useContext } from 'react';

export type UserRole = 'organizer' | 'participant' | 'administrator';

export interface UserRoleContextType {
  role: UserRole;
  changeRole: (newRole: UserRole) => void;
  setRoleOnly: (newRole: UserRole) => void;
}

export const UserRoleContext = createContext<UserRoleContextType | undefined>(undefined);

export function useUserRole() {
  const context = useContext(UserRoleContext);
  if (context === undefined) {
    throw new Error('useUserRole muss innerhalb eines UserRoleProvider verwendet werden');
  }
  return context;
}
