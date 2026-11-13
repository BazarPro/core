import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import i18n from '../../../../i18n';
import { translateAppError } from '../../../../lib/errors';
import type { SumUpReturn } from '../../../../native/sumupReturn';

/** Tells how connecting SumUp went, when the browser or the app comes back from SumUp. */
export function useSumUpReturnToast() {
  const { t } = useTranslation('organizer');
  return useCallback(
    (result: SumUpReturn) => {
      if (!result.error) {
        toast.success(t('features.sumup.connectedToast'));
        return;
      }
      const code = i18n.exists(result.error, { ns: 'errors' }) ? result.error : 'sumup.failed';
      toast.error(translateAppError({ code }));
    },
    [t]
  );
}
