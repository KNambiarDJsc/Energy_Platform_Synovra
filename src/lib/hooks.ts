'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { getStore } from '@/data/store';
import type { Actor, Role, User } from '@/domain/types';
import { can, type Permission } from '@/domain/permissions';
import { DATA_SOURCE, getRuntime, getServerRuntime, loadRuntime, subscribeRuntime, type FeatureName, type RuntimeInfo } from '@/lib/runtime';
import { getServices } from '@/services';
import { ensureApiSession, getApiSessionState, subscribeApiSession } from '@/services/http/session';
import { getSessionUserId, subscribeSession } from '@/services/session';
import type { Services } from '@/services/types';
import { useToast } from '@/components/ui/Toast';

const subscribeNoop = () => () => {};

/** False during server render and first hydration pass, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

export interface Session {
  ready: boolean;
  user: User | null;
  role: Role | null;
  can: (p: Permission) => boolean;
  /** Whether this deployment offers an area (always true with the in-browser demo). */
  has: (f: FeatureName) => boolean;
  /** Set when signing in to the API failed (HTTP mode). */
  error: string | null;
}

export function useRuntime(): RuntimeInfo {
  const info = useSyncExternalStore(subscribeRuntime, getRuntime, getServerRuntime);
  useEffect(() => { void loadRuntime(); }, []);
  return info;
}

// Must return the same object every time (React compares snapshots by identity).
const IDLE_API = { status: 'idle' as const };
const idleApi = () => IDLE_API;

export function useSession(): Session {
  const hydrated = useHydrated();
  const runtime = useRuntime();
  const id = useSyncExternalStore(subscribeSession, getSessionUserId, () => null);
  const api = useSyncExternalStore(subscribeApiSession, getApiSessionState, idleApi);
  const http = DATA_SOURCE === 'http';

  // Development sign-in picks a user; company sign-in (OIDC) gets its session from /auth/callback instead.
  const devAuth = http && runtime.loaded && runtime.authMode === 'dev';
  const oidcAuth = http && runtime.loaded && runtime.authMode === 'oidc';
  useEffect(() => {
    if (devAuth && hydrated && id) ensureApiSession(id);
  }, [devAuth, hydrated, id]);

  let user: User | null = null;
  let ready = hydrated;
  let error: string | null = null;
  const fromActor = (a: Actor): User => ({ id: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, siteScope: a.siteScope, title: '', email: '', active: true });
  if (!http) {
    user = hydrated && id ? (getStore().db.users.find((u) => u.id === id && u.active) ?? null) : null;
  } else if (hydrated && !runtime.loaded) {
    ready = false; // learning how this deployment signs people in
  } else if (oidcAuth) {
    if (api.status === 'ready') user = fromActor(api.session.actor);
    else if (api.status === 'error') error = api.message;
  } else if (hydrated && id) {
    if (api.status === 'ready' && api.session.userId === id) {
      user = fromActor(api.session.actor);
    } else if (api.status === 'error' && api.userId === id) {
      error = api.message;
    } else {
      ready = false; // signing in to the API
    }
  }
  return {
    ready,
    user,
    role: user?.role ?? null,
    can: (p) => (user ? can(user.role, p) : false),
    has: (f) => runtime.features[f],
    error,
  };
}

/** Normalises ForbiddenError, ValidationError, Zod issues and plain errors into one readable string. */
export function errorMessage(e: unknown): string {
  if (!e) return 'Something went wrong.';
  const err = e as { message?: string; issues?: unknown[] };
  if (Array.isArray(err.issues) && err.issues.length) {
    const first = err.issues
      .map((i) => (typeof i === 'string' ? i : ((i as { message?: string }).message ?? '')))
      .filter(Boolean);
    if (first.length) return first.join(' ');
  }
  return err.message ?? 'Something went wrong.';
}

export function useSvcQuery<T>(
  key: readonly unknown[],
  fn: (s: Services) => Promise<T>,
  options: { enabled?: boolean } = {},
) {
  const { user } = useSession();
  const userId = user?.id ?? null;
  return useQuery<T, Error>({
    queryKey: ['svc', userId, ...key],
    queryFn: () => fn(getServices()),
    enabled: (options.enabled ?? true) && !!userId,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
}

interface ActionOptions<R, A> {
  success?: string | ((result: R, arg: A) => string);
  onSuccess?: (result: R, arg: A) => void;
  onError?: (e: Error) => void;
  /** Forms that show the error inline can switch the toast off. */
  toastError?: boolean;
}

export function useAction<A, R>(fn: (s: Services, arg: A) => Promise<R>, opts: ActionOptions<R, A> = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<R, Error, A>({
    mutationFn: (arg) => fn(getServices(), arg),
    onSuccess: (result, arg) => {
      void qc.invalidateQueries({ queryKey: ['svc'] });
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(result, arg) : opts.success);
      opts.onSuccess?.(result, arg);
    },
    onError: (e) => {
      if (opts.toastError !== false) toast.error(errorMessage(e));
      opts.onError?.(e);
    },
  });
}
