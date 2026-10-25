import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
  OptionalRestArgsOrSkip,
} from './types';
import { ApiClient, type OptimisticStore } from './client';
import { getFunctionName } from './functions';

/* eslint-disable react-refresh/only-export-components -- hooks belong next to their provider */

/** React hooks for the backend: live queries, mutations and sign-in. */

const ClientContext = createContext<ApiClient | null>(null);

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  useEffect(() => client.start(), [client]);
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

/** The client, for calls outside of hooks. */
export function useApiClient(): ApiClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error('useApiClient needs an ApiProvider');
  return client;
}

/** Live result of a query; undefined while loading or with "skip". Throws its error. */
export function useQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...rest: OptionalRestArgsOrSkip<Query>
): FunctionReturnType<Query> | undefined {
  const client = useApiClient();
  const skip = rest[0] === 'skip';
  const args = (skip ? {} : (rest[0] ?? {})) as Record<string, unknown>;
  const name = getFunctionName(query);
  const key = skip ? null : `${name}:${JSON.stringify(args)}`;
  // The key stands for the arguments, so a new args object each render is fine
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableArgs = useMemo(() => args, [key]);

  const subscribe = useCallback(
    (listener: () => void) => (key === null ? () => {} : client.watch(query, stableArgs, listener)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, key]
  );
  const state = useSyncExternalStore(subscribe, () =>
    key === null ? undefined : client.snapshot(query, stableArgs)
  );
  if (!state?.loaded) return undefined;
  if (state.error) throw state.error;
  return state.value as FunctionReturnType<Query>;
}

export type ReactMutation<Mutation extends FunctionReference<'mutation'>> = ((
  ...args: OptionalRestArgs<Mutation>
) => Promise<FunctionReturnType<Mutation>>) & {
  withOptimisticUpdate(
    update: (store: TypedOptimisticStore, args: FunctionArgs<Mutation>) => void
  ): ReactMutation<Mutation>;
};

export type TypedOptimisticStore = {
  getQuery<Query extends FunctionReference<'query'>>(
    query: Query,
    args?: Query['_args']
  ): FunctionReturnType<Query> | undefined;
  setQuery<Query extends FunctionReference<'query'>>(
    query: Query,
    args: Query['_args'],
    value: FunctionReturnType<Query>
  ): void;
};

function makeMutation<Mutation extends FunctionReference<'mutation'>>(
  client: ApiClient,
  mutation: Mutation,
  update?: (store: OptimisticStore, args: Record<string, unknown>) => void
): ReactMutation<Mutation> {
  const call = ((args?: Record<string, unknown>) =>
    client.runMutation(mutation, args ?? {}, update)) as unknown as ReactMutation<Mutation>;
  call.withOptimisticUpdate = (next) =>
    makeMutation(client, mutation, next as unknown as typeof update);
  return call;
}

export function useMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation
): ReactMutation<Mutation> {
  const client = useApiClient();
  const name = getFunctionName(mutation);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => makeMutation(client, mutation), [client, name]);
}

/** Whether someone is signed in. */
export function useAuthState(): { isLoading: boolean; isAuthenticated: boolean } {
  const client = useApiClient();
  const auth = useSyncExternalStore(
    useCallback((listener: () => void) => client.onAuthChange(listener), [client]),
    () => client.getAuth()
  );
  return useMemo(
    () => ({ isLoading: auth.isLoading, isAuthenticated: auth.userId !== null }),
    [auth]
  );
}

/** Whether the live connection to the backend is up. */
export function useConnected(): boolean {
  const client = useApiClient();
  return useSyncExternalStore(
    useCallback((listener: () => void) => client.onConnectionChange(listener), [client]),
    () => client.isConnected()
  );
}

/** Sign-in, sign-out and changing the password. */
export function useAuthActions() {
  const client = useApiClient();
  return useMemo(
    () => ({
      signIn: (provider: string, params?: Record<string, unknown>) =>
        client.signIn(provider, params),
      signOut: () => client.signOut(),
      changePassword: (oldPassword: string, newPassword: string) =>
        client.changePassword(oldPassword, newPassword),
    }),
    [client]
  );
}
