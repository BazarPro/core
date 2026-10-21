import { useAuthActions } from '../lib/api/react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export const useAuth = () => {
  const navigate = useNavigate();
  const { signOut } = useAuthActions();

  const logout = async () => {
    await signOut();
    toast.success('Erfolgreich abgemeldet.');
    navigate('/login');
  };

  return {
    logout,
  };
};
