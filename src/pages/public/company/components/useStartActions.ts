import { useAuthState } from '../../../../lib/api/react';
import { useNavigate } from 'react-router-dom';

/** Targets of the "Basar organisieren" / "Als Verkäufer mitmachen" buttons. */
export function useStartActions() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthState();
  return {
    isAuthenticated,
    goToOrganizer: () => navigate(isAuthenticated ? '/my-events' : '/register?role=organizer'),
    goToSeller: () => navigate(isAuthenticated ? '/my-products' : '/register?role=participant'),
  };
}
