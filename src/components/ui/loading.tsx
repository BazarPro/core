import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Button } from './button';
import { Skeleton } from './skeleton';
import { TableCell, TableRow } from './table';

/** Without an answer after this long, the server is probably unreachable */
const SLOW_AFTER_MS = 15_000;

/** Reloading starts every request again, also a session check that never got an answer. */
export function RetryButton({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <Button variant="outline" size="sm" onClick={onRetry ?? (() => window.location.reload())}>
      <RefreshCw className="mr-2 h-4 w-4" />
      {t('loadState.retry')}
    </Button>
  );
}

function SlowNotice() {
  const { t } = useTranslation();
  return (
    <div className="mb-6 flex flex-col items-start gap-3 rounded-lg border bg-card p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p>{t('loadState.slow')}</p>
      <RetryButton />
    </div>
  );
}

/**
 * Wraps skeletons: tells screen readers that the content is loading, fades in after a
 * moment and offers a retry when the server does not answer.
 */
export function Loading({ className, children }: { className?: string; children: ReactNode }) {
  const { t } = useTranslation();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div role="status" aria-busy="true" className={cn('loading-appear', className)}>
      <span className="sr-only">{t('actions.loading')}</span>
      {slow && <SlowNotice />}
      {children}
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-2/3 max-w-sm" />
      <Skeleton className="h-4 w-full max-w-md" />
    </div>
  );
}

/** Lines of text, the last one shorter. */
export function TextSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn('h-4', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

/** Rows like the item and sales lists: picture, two lines and a value on the right. */
export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 rounded-lg border bg-card p-4">
          <Skeleton className="h-14 w-14 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="hidden h-6 w-16 sm:block" />
        </div>
      ))}
    </div>
  );
}

/** Cards in a grid, like bazaars and public items. */
export function CardGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-3 rounded-lg border bg-card p-4">
          <Skeleton className="aspect-[4/3] w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Label and input pairs and a button. */
export function FormSkeleton({ fields = 5, className }: { fields?: number; className?: string }) {
  return (
    <div className={cn('space-y-6 rounded-lg border bg-card p-6', className)}>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <Skeleton className="h-10 w-32" />
    </div>
  );
}

/** Rows for a table that is still loading; the table keeps its header. */
export function TableRowsSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  const { t } = useTranslation();
  return Array.from({ length: rows }, (_, row) => (
    <TableRow key={row} aria-busy="true" className="loading-appear hover:bg-transparent">
      {Array.from({ length: columns }, (_, column) => (
        <TableCell key={column}>
          {row === 0 && column === 0 && <span className="sr-only">{t('actions.loading')}</span>}
          <Skeleton className={cn('h-4', column === 0 ? 'w-3/4' : 'w-1/2')} />
        </TableCell>
      ))}
    </TableRow>
  ));
}

type PageVariant = 'overview' | 'list' | 'grid' | 'detail' | 'form';

/**
 * Placeholder for a whole page while its data loads, in the rough shape of the page:
 * an overview with tiles and cards, a list, a grid of cards, a detail page or a form.
 * `className` narrows it like the page, e.g. `max-w-2xl`.
 */
export function PageSkeleton({
  variant = 'overview',
  className,
}: {
  variant?: PageVariant;
  className?: string;
}) {
  return (
    <div className="container mx-auto">
      <Loading className={cn('mx-auto space-y-8', className)}>
        <HeaderSkeleton />
        {variant === 'overview' && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-24" />
              ))}
            </div>
            <ListSkeleton rows={3} />
          </>
        )}
        {variant === 'list' && (
          <>
            <Skeleton className="h-10 w-full max-w-md" />
            <ListSkeleton rows={5} />
          </>
        )}
        {variant === 'grid' && <CardGridSkeleton />}
        {variant === 'detail' && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
            <Skeleton className="aspect-[4/3] w-full" />
            <div className="space-y-4 rounded-lg border bg-card p-6">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-8 w-1/3" />
              <TextSkeleton lines={4} />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        )}
        {variant === 'form' && <FormSkeleton />}
      </Loading>
    </div>
  );
}

/** The narrow card of sign-in and registration. */
export function AuthFormSkeleton() {
  return (
    <Loading className="container mx-auto px-4 py-4">
      <div className="mx-auto max-w-md md:py-12">
        <FormSkeleton fields={2} className="p-8 shadow-lg" />
      </div>
    </Loading>
  );
}
