import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery } from '../../../lib/api/react';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../lib/api/functions';
import { NOTIFICATION_CATEGORIES } from '../../../../convex/constants';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '../../../components/ui/checkbox';
import { Label } from '../../../components/ui/label';
import { getUserFacingErrorMessage } from '../../../lib/errors';

/** Which emails the user gets; the red markers in the menu stay either way. */
export function NotificationsCard() {
  const { t } = useTranslation('account');
  const prefs = useQuery(api.notifications.getMyNotificationPrefs);
  const update = useMutation(api.notifications.updateMyNotificationPrefs).withOptimisticUpdate(
    (store, { prefs: change }) => {
      const current = store.getQuery(api.notifications.getMyNotificationPrefs, {});
      if (current) {
        store.setQuery(api.notifications.getMyNotificationPrefs, {}, { ...current, ...change });
      }
    }
  );

  // Opened from the unsubscribe page via /account#notifications
  const { hash } = useLocation();
  const sectionRef = useRef<HTMLElement>(null);
  const loaded = prefs !== undefined;
  useEffect(() => {
    if (loaded && hash === '#notifications') sectionRef.current?.scrollIntoView();
  }, [loaded, hash]);

  return (
    <section
      ref={sectionRef}
      id="notifications"
      className="mb-8 rounded-xl border bg-card p-6 shadow-sm"
    >
      <h2 className="mb-1 flex items-center gap-2 text-xl font-semibold">
        <Bell className="h-5 w-5" /> {t('notifications.title')}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">{t('notifications.intro')}</p>
      {prefs && (
        <ul className="space-y-3">
          {NOTIFICATION_CATEGORIES.map((category) => {
            const title = t(`notifications.categories.${category}.title`);
            const description = t(`notifications.categories.${category}.description`);
            const id = `notify-${category}`;
            return (
              <li key={category} className="flex items-start gap-3">
                <Checkbox
                  id={id}
                  checked={prefs[category]}
                  className="mt-0.5"
                  onCheckedChange={(checked) =>
                    update({ prefs: { [category]: !!checked } }).catch((error) =>
                      toast.error(getUserFacingErrorMessage(error))
                    )
                  }
                />
                <div>
                  <Label htmlFor={id} className="cursor-pointer font-medium">
                    {title}
                  </Label>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
