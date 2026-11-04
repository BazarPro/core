import { Search } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';
import { Input } from './input';

/** Text field with a search icon; `className` sizes the whole field. */
export function SearchInput({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-10" {...props} />
    </div>
  );
}
