'use client';
import { ArrowRight, Building2, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Brand } from '@/components/app/Brand';
import { DemoBanner } from '@/components/app/DemoBanner';
import { Notice } from '@/components/ui/Layout';
import { buttonClass } from '@/components/ui/buttonClass';
import { getStore } from '@/data/store';
import { ROLE_LABELS, ROLE_SUMMARIES, permissionsFor } from '@/domain/permissions';
import type { Role, User } from '@/domain/types';
import { cn } from '@/lib/format';
import { useHydrated, useRuntime, useSession } from '@/lib/hooks';
import { API_BASE_URL, DATA_SOURCE } from '@/lib/runtime';
import { beginSignIn, safeNext } from '@/services/http/oidc';
import { DEMO_USER_FOR_ROLE, setSessionUserId } from '@/services/session';

const ROLES = Object.keys(ROLE_LABELS) as Role[];

type PickerUser = Pick<User, 'id' | 'name' | 'title' | 'role'> & { siteScope?: User['siteScope'] };

/** Company sign-in: the browser goes to the organisation's identity provider and comes back to /auth/callback. */
function CompanySignIn({ next }: { next: string }) {
  const runtime = useRuntime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cfg = runtime.oidc;
  const provider = cfg ? new URL(cfg.issuer).host : null;

  const start = async () => {
    if (!cfg) return;
    setBusy(true);
    setError(null);
    try {
      window.location.assign(await beginSignIn(cfg, `${window.location.origin}/auth/callback`, next));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in could not start.');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <DemoBanner />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-8 md:grid-cols-[5fr_6fr] md:px-8 md:py-14">
        <div>
          <Brand />
          <main id="main" className="app-enter mt-16 md:mt-24">
            <h1 className="text-4xl font-semibold tracking-tight text-navy md:text-5xl">Sign in</h1>
            <p className="mt-4 max-w-md text-lg text-ink">Use your organisation&apos;s account. What you can see and do follows the role an administrator gave you.</p>
            {!runtime.loaded ? (
              <p className="mt-8 flex items-center gap-2 text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking how this deployment signs people in…</p>
            ) : cfg ? (
              <button type="button" onClick={start} disabled={busy} className={buttonClass('primary', 'md', 'mt-8 px-6 text-base')}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Building2 className="h-4 w-4" aria-hidden />}
                Sign in with your organisation
              </button>
            ) : (
              <Notice tone="warn" className="mt-8" title="Company sign-in is not configured">
                The API uses OIDC but publishes no client ID. Set OIDC_CLIENT_ID on the API server (see server/README.md).
              </Notice>
            )}
            {provider && <p className="mt-3 text-sm text-muted">You will be sent to {provider} and brought back here.</p>}
            {(error ?? runtime.error) && <Notice tone="danger" className="mt-6" title="Cannot sign in">{error ?? runtime.error}</Notice>}
          </main>
        </div>
        <aside className="hidden self-end rounded-lg bg-navy p-8 text-[#E6EEF2] md:block" aria-label="About access">
          <p className="text-2xl font-semibold leading-snug text-white">A label finds a battery. Your sign-in decides what you see of it.</p>
          <p className="mt-4 text-[#C9D8E0]">Every read and write is checked against your role and site scope, and refusals are recorded with the reason.</p>
        </aside>
      </div>
    </div>
  );
}

function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const hydrated = useHydrated();
  const next = safeNext(params.get('next'));
  const runtime = useRuntime();
  const session = useSession();
  const [apiUsers, setApiUsers] = useState<PickerUser[]>([]);
  useEffect(() => {
    if (DATA_SOURCE !== 'http' || runtime.authMode !== 'dev' || !runtime.loaded || runtime.error) return;
    fetch(`${API_BASE_URL}/api/v1/dev/users`).then((r) => (r.ok ? r.json() : [])).then(setApiUsers).catch(() => setApiUsers([]));
  }, [runtime.authMode, runtime.loaded, runtime.error]);
  const users: PickerUser[] = DATA_SOURCE === 'http' ? apiUsers : hydrated ? getStore().db.users : [];
  const connectionError = runtime.error ?? session.error;

  if (DATA_SOURCE === 'http' && runtime.loaded && runtime.authMode === 'oidc') return <CompanySignIn next={next} />;

  return (
    <div className="min-h-screen bg-canvas">
      <DemoBanner />
      <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-8 px-4 py-8 md:px-8 md:py-14 lg:grid-cols-[4fr_7fr]">
        <div className="lg:sticky lg:top-10 lg:self-start">
          <Brand />
          <main id="main" className="app-enter mt-12 lg:mt-20">
            <h1 className="text-4xl font-semibold tracking-tight text-navy md:text-5xl">Choose a demo role</h1>
            <p className="mt-4 max-w-md text-lg text-ink">
              There are no passwords. The role decides what you can see and do, and the service layer enforces it on every call. Switch any time from the top bar.
            </p>
            <Notice tone="synthetic" className="mt-6 max-w-md" title={DATA_SOURCE === 'http' ? 'Development sign-in' : 'Demonstration sign-in only'}>
              {DATA_SOURCE === 'http'
                ? 'Anyone who can reach this API can act as any user. Production uses your identity provider (OIDC) and the same permission model.'
                : 'This is not authentication. A production deployment uses your identity provider (OIDC) and the same permission model.'}
            </Notice>
            {connectionError && (
              <Notice tone="danger" className="mt-4 max-w-md" title="Cannot sign in">
                {connectionError}
              </Notice>
            )}
          </main>
        </div>

        <ul className="grid gap-1 self-start lg:mt-16" aria-label="Demo roles">
          {ROLES.map((role, i) => {
            const user = users.find((u) => u.id === DEMO_USER_FOR_ROLE[role]);
            return (
              <li key={role} className="anim-row" style={{ animationDelay: `${120 + i * 50}ms` }}>
                <button
                  type="button"
                  data-testid={`role-${role}`}
                  onClick={() => {
                    setSessionUserId(DEMO_USER_FOR_ROLE[role]);
                    router.push(next);
                  }}
                  className={cn(
                    'group grid w-full grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 rounded-md px-5 py-4 text-left transition-[background-color,transform] duration-150 ease-out active:scale-[0.99]',
                    i % 2 === 0 ? 'bg-white' : 'bg-[#F7FAFB]',
                    'hover:bg-teal-50 focus-visible:bg-teal-50',
                  )}
                >
                  <span className="text-lg font-semibold text-navy">{ROLE_LABELS[role]}</span>
                  <ArrowRight className="row-span-3 h-5 w-5 text-teal transition-transform duration-200 ease-out group-hover:translate-x-1" aria-hidden />
                  <span className="text-base text-ink">{ROLE_SUMMARIES[role]}</span>
                  <span className="text-sm text-muted">
                    {user ? `${user.name}, ${user.title}` : 'Synthetic user'} · {permissionsFor(role).length} permissions
                    {user?.siteScope && ` · ${user.siteScope === 'all' ? 'all sites in tenant' : `${user.siteScope.length} site(s)`}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
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
