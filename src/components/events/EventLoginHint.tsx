import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';

/**
 * For guests at an address the backend answers nothing for: the event may be for signed-in
 * users only. Says "maybe", so it does not tell whether such an event exists.
 */
export function EventLoginHint() {
  const { t } = useTranslation('events');
  const navigate = useNavigate();
  return (
    <div className="mt-4 space-y-3 text-center">
      <p className="text-muted-foreground">{t('page.loginHint')}</p>
      <Button onClick={() => navigate('/login')}>{t('page.loginAction')}</Button>
    </div>
  );
}
