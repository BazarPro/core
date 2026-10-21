import type { FunctionReference, FunctionReturnType } from 'convex/server';
import { useQuery } from '../lib/api/react';

/**
 * useQuery for public pages. Queries go over HTTP and only their updates over the
 * WebSocket, so search engine renderers without WebSockets (e.g. Googlebot) get the
 * data like everyone else.
 */
export function usePublicQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: Query['_args'] | 'skip'
): FunctionReturnType<Query> | undefined {
  return (useQuery as (query: Query, args: Query['_args'] | 'skip') => FunctionReturnType<Query>)(
    query,
    args
  );
}
