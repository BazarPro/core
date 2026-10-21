import { useAuthActions } from '../lib/api/react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export const useAuth = () => {
  const navigate = useNavigate();
  const { signOut } = useAuthActions();
  const { t } = useTranslation('auth');

  const logout = async () => {
    await signOut();
    toast.success(t('signedOut'));
    navigate('/login');
  };

  return {
    logout,
  };
};
