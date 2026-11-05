import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * The buttons of a long form, always in reach: stays at the lower edge of the screen, above
 * the phone's tab bar, its buttons clear of what stands out of that bar. Spans the width of the page content (see `main` in ResponsiveSidebar).
 */
export function StickyActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'sticky bottom-[var(--bottom-inset,0px)] z-20 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 pb-[calc(0.75rem+var(--tab-bar-bulge,0px))] pt-3 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8',
        className
      )}
    >
      {children}
    </div>
  );
}
