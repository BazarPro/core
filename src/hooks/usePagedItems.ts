import { useState } from 'react';

/** One page of a list that is already loaded. A new `resetKey` (filter, search) starts at page 1. */
export function usePagedItems<T>(items: T[], resetKey: string, perPage = 20) {
  const [state, setState] = useState({ page: 1, resetKey });
  if (state.resetKey !== resetKey) setState({ page: 1, resetKey });
  const requested = state.resetKey === resetKey ? state.page : 1;

  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  // The list may have become shorter than the page shown
  const page = Math.min(requested, totalPages);
  return {
    pageItems: items.slice((page - 1) * perPage, page * perPage),
    page,
    totalPages,
    setPage: (next: number) => setState({ page: next, resetKey }),
  };
}
