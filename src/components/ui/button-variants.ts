import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full [&>svg]:mr-0 [&>svg]:ml-0 text-sm font-medium transition-all cursor-pointer disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_2px_0_var(--primary-shade)] hover:bg-primary/90 active:translate-y-px active:shadow-none disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 [&_svg]:text-destructive-foreground',
        outline:
          'border border-input bg-card text-foreground hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-transparent dark:hover:bg-input/30',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        /** Repeated or current actions: the active menu entry, an action per list row */
        soft: 'bg-primary/10 text-primary hover:bg-primary/15 dark:bg-primary/20 dark:text-foreground dark:hover:bg-primary/30',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2 has-[>svg]:px-3.5',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-11 px-6 text-base has-[>svg]:px-5',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

/** While a button is busy, its spinner takes the place of its own icon */
export const loadingButtonClass = '[&>svg:not([data-spinner])]:hidden';
