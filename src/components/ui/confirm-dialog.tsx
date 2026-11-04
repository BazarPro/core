import type { MouseEventHandler, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog';
import { buttonVariants } from './button-variants';

/**
 * Asks before doing something: with `trigger` it opens by itself, otherwise through
 * `open`. `children` go between the text and the buttons. To keep it open while saving,
 * call `event.preventDefault()` in `onConfirm`.
 */
export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  onConfirm,
  destructive = false,
  loading = false,
  disabled = false,
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: ReactNode;
  onConfirm: MouseEventHandler<HTMLButtonElement>;
  destructive?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation('common');
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription asChild>
              <div>{description}</div>
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{t('actions.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            loading={loading}
            disabled={loading || disabled}
            className={destructive ? buttonVariants({ variant: 'destructive' }) : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
