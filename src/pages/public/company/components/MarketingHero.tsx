import type { ReactNode } from 'react';

interface MarketingHeroProps {
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}

/** Page header of the marketing pages, in the style of the landing hero. */
export function MarketingHero({ eyebrow, title, children, actions }: MarketingHeroProps) {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      </div>
      <div className="container mx-auto max-w-3xl space-y-6 px-4 py-16 text-center sm:py-24">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
        <h1 className="text-balance text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
          {title}
        </h1>
        <div className="mx-auto max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl">
          {children}
        </div>
        {actions && (
          <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row">{actions}</div>
        )}
      </div>
    </section>
  );
}

interface SectionHeadingProps {
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
}

export function SectionHeading({ eyebrow, title, children }: SectionHeadingProps) {
  return (
    <div className="mx-auto mb-12 max-w-2xl space-y-4 text-center sm:mb-16">
      {eyebrow && (
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
      )}
      <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {children && <p className="text-pretty text-lg text-muted-foreground">{children}</p>}
    </div>
  );
}
