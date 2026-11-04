'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * `stacked` shows each row as a block instead of a table to scroll sideways, whenever the
 * table itself has too little room (the side menu takes some on tablets, too). Cells take a
 * full line; those with `data-label` name their column and share a line, those with
 * `data-inline` share a line without a name.
 */
const STACKED =
  '@max-4xl:[&_thead]:hidden @max-4xl:[&_tbody]:block @max-4xl:[&_tr]:flex @max-4xl:[&_tr]:flex-wrap @max-4xl:[&_tr]:items-center @max-4xl:[&_tr]:gap-x-4 @max-4xl:[&_tr]:gap-y-1.5 @max-4xl:[&_tr]:p-4 @max-4xl:[&_td]:block @max-4xl:[&_td]:basis-full @max-4xl:[&_td[data-label]]:basis-auto @max-4xl:[&_td[data-inline]]:basis-auto @max-4xl:[&_td]:h-auto @max-4xl:[&_td]:whitespace-normal @max-4xl:[&_td]:p-0! @max-4xl:[&_td]:text-left @max-4xl:[&_td[data-label]]:before:mr-2 @max-4xl:[&_td[data-label]]:before:text-muted-foreground @max-4xl:[&_td[data-label]]:before:content-[attr(data-label)]';

function Table({
  className,
  stacked,
  ...props
}: React.ComponentProps<'table'> & { stacked?: boolean }) {
  return (
    <div
      data-slot="table-container"
      className={cn('relative w-full overflow-x-auto', stacked && '@container')}
    >
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', stacked && STACKED, className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('bg-muted/40 [&_tr]:border-b [&_tr]:hover:bg-transparent', className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('bg-muted/50 border-t font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors',
        className
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'text-muted-foreground h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap first:pl-4 last:pr-4 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'px-3 py-2.5 align-middle whitespace-nowrap first:pl-4 last:pr-4 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('text-muted-foreground mt-4 text-sm', className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
