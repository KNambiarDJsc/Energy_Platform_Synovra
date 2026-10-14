'use client';
import { ArrowRight, UserRound } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Brand } from '@/components/app/Brand';
import { DemoBanner } from '@/components/app/DemoBanner';
import { Notice } from '@/components/ui/Layout';
import { getStore } from '@/data/store';
import { ROLE_LABELS, ROLE_SUMMARIES, permissionsFor } from '@/domain/permissions';
import type { Role, User } from '@/domain/types';
import { useHydrated, useRuntime, useSession } from '@/lib/hooks';
import { API_BASE_URL, DATA_SOURCE } from '@/lib/runtime';
import { DEMO_USER_FOR_ROLE, setSessionUserId } from '@/services/session';

const ROLES = Object.keys(ROLE_LABELS) as Role[];

type PickerUser = Pick<User, 'id' | 'name' | 'title' | 'role'> & { siteScope?: User['siteScope'] };

function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const hydrated = useHydrated();
  const requested = params.get('next') ?? '/app/overview';
  // Only same-origin app paths are accepted.
  const next = requested.startsWith('/app') && !requested.startsWith('//') ? requested : '/app/overview';
  const runtime = useRuntime();
  const session = useSession();
  const [apiUsers, setApiUsers] = useState<PickerUser[]>([]);
  useEffect(() => {
    if (DATA_SOURCE !== 'http' || runtime.authMode !== 'dev' || !runtime.loaded || runtime.error) return;
    fetch(`${API_BASE_URL}/api/v1/dev/users`).then((r) => (r.ok ? r.json() : [])).then(setApiUsers).catch(() => setApiUsers([]));
  }, [runtime.authMode, runtime.loaded, runtime.error]);
  const users: PickerUser[] = DATA_SOURCE === 'http' ? apiUsers : hydrated ? getStore().db.users : [];
  const connectionError = runtime.error ?? session.error;

  if (DATA_SOURCE === 'http' && runtime.authMode === 'oidc') {
    return (
      <div className="min-h-screen bg-canvas">
        <DemoBanner />
        <div className="mx-auto max-w-3xl px-4 py-12">
          <Brand />
          <main id="main" className="mt-8">
            <h1 className="text-3xl font-semibold text-navy">Sign in</h1>
            <Notice tone="info" className="mt-4" title="Single sign-on">
              This deployment uses your organisation’s identity provider. The sign-in redirect is configured per deployment; see server/README.md.
            </Notice>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <DemoBanner />
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
        <Brand />
        <main id="main" className="mt-8">
          <h1 className="text-3xl font-semibold text-navy">Choose a demo role</h1>
          <p className="mt-2 max-w-2xl text-ink">
            There are no passwords. Selecting a role changes what the platform lets you see and do, and the service layer enforces that for every call. You can switch role at any time from the top bar.
          </p>
          <Notice tone="synthetic" className="mt-4" title={DATA_SOURCE === 'http' ? 'Development sign-in' : 'Demonstration sign-in only'}>
            {DATA_SOURCE === 'http'
              ? 'The API is running with development sign-in, so anyone who can reach it can act as any user. Production uses your identity provider (OIDC) and the same permission model.'
              : 'This is not authentication. A production deployment would use your identity provider (OIDC) and the same permission model.'}
          </Notice>
          {connectionError && (
            <Notice tone="danger" className="mt-4" title="Cannot sign in">
              {connectionError}
            </Notice>
          )}

          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {ROLES.map((role) => {
              const user = users.find((u) => u.id === DEMO_USER_FOR_ROLE[role]);
              return (
                <li key={role}>
                  <button
                    type="button"
                    data-testid={`role-${role}`}
                    onClick={() => {
                      setSessionUserId(DEMO_USER_FOR_ROLE[role]);
                      router.push(next);
                    }}
                    className="card group flex h-full w-full flex-col p-5 text-left transition-colors hover:border-teal focus-visible:border-teal"
                  >
                    <span className="flex items-center gap-2 text-lg font-semibold text-navy">
                      <UserRound className="h-5 w-5 text-teal" aria-hidden />
                      {ROLE_LABELS[role]}
                    </span>
                    <span className="mt-2 text-sm text-ink">{ROLE_SUMMARIES[role]}</span>
                    <span className="mt-3 text-xs text-muted">
                      {user ? `${user.name}, ${user.title}` : 'Synthetic user'} · {permissionsFor(role).length} permissions
                      {user?.siteScope && ` · ${user.siteScope === 'all' ? 'all sites in tenant' : `${user.siteScope.length} site(s)`}`}
                    </span>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-teal-800">
                      Continue as this role <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </main>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}
