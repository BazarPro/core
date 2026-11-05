import type { ReactNode } from 'react';
import { BackButton } from '../../../../components/navigation/BackButton';
import { cn } from '../../../../lib/utils';

/** "or" between two lines. Without a background of its own: the form has none on a phone */
export function AuthDivider({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 text-muted-foreground', className)}>
      <span className="flex-1 border-t" />
      {children}
      <span className="flex-1 border-t" />
    </div>
  );
}

/**
 * The frame of the login and register pages. On a phone the form takes the full width
 * and fits the screen without a card around it; from `sm` on it sits in a card.
 */
export function AuthPage({
  children,
  below,
  onBack,
  testId,
}: {
  children: ReactNode;
  /** Outside the card, below the form */
  below?: ReactNode;
  /** Replaces the way back to the previous page, for a step inside the form */
  onBack?: () => void;
  testId?: string;
}) {
  return (
    // The negative margins give back most of the padding of the page layout on a phone
    <div className="container mx-auto -mt-2 -mb-8 sm:my-0 sm:px-4 sm:py-4">
      <BackButton
        variant="ghost"
        size="sm"
        className="sm:mb-4"
        fallbackPath="/"
        {...(onBack ? { onBack } : {})}
      />
      <div className="mx-auto mt-1 max-w-md sm:mt-0 md:py-12" data-testid={testId}>
        <div className="sm:rounded-xl sm:border sm:bg-card sm:p-8 sm:shadow-xs">{children}</div>
        {below}
      </div>
    </div>
  );
}
