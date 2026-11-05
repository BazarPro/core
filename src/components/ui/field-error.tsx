import type { ReactNode } from 'react';

/** The message below a form field; renders nothing without one. */
export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-destructive">{children}</p>;
}
