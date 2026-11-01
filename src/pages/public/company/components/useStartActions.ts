import { useAuthState } from '../../../../lib/api/react';
import { useNavigate } from 'react-router-dom';

/** Targets of the "Basar organisieren" / "Als Verkäufer mitmachen" buttons. */
export function useStartActions() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthState();
  return {
    isAuthenticated,
    // Visitors set up a bazaar first and sign up only to create it
    goToOrganizer: () => navigate(isAuthenticated ? '/my-events' : '/events/new'),
    goToSeller: () => navigate(isAuthenticated ? '/my-products' : '/register?role=participant'),
  };
}
