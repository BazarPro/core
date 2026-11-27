/**
 * One look for every pop-up window (Dialog and AlertDialog): a dimmed, slightly blurred
 * page behind, a card with round corners in the middle, the title in the display face
 * on the left, the buttons at the bottom right (full width and stacked on phones).
 */
export const dialogOverlay =
  'fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';

export const dialogSurface =
  'fixed left-[50%] top-[50%] z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-5 overflow-y-auto overscroll-contain rounded-2xl border bg-card p-5 text-card-foreground shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:p-6';

export const dialogHeader = 'flex flex-col gap-1.5 pr-8 text-left';

export const dialogFooter =
  'flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end [&>*]:max-sm:w-full';

export const dialogTitle = 'font-display text-xl font-bold leading-tight tracking-tight';

export const dialogDescription = 'text-sm text-muted-foreground';

export const dialogClose =
  'absolute right-3 top-3 flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none';
