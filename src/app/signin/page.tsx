'use client';
import { Building2, ChevronRight, FlaskConical } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { BrandMark } from '@/components/app/Brand';
import { DemoBanner } from '@/components/app/DemoBanner';
import { Notice } from '@/components/ui/Layout';
import { Spinner } from '@/components/ui/States';
import { buttonClass } from '@/components/ui/buttonClass';
import { getStore } from '@/data/store';
import { ROLE_LABELS, ROLE_SUMMARIES, permissionsFor } from '@/domain/permissions';
import type { Role, User } from '@/domain/types';
import { initials } from '@/lib/format';
import { useHydrated, useRuntime, useSession } from '@/lib/hooks';
import { API_BASE_URL, DATA_SOURCE } from '@/lib/runtime';
import { beginSignIn, safeNext } from '@/services/http/oidc';
import { DEMO_USER_FOR_ROLE, setSessionUserId } from '@/services/session';

const ROLES = Object.keys(ROLE_LABELS) as Role[];

type PickerUser = Pick<User, 'id' | 'name' | 'title' | 'role'> & { siteScope?: User['siteScope'] };

/** The one column every sign-in screen uses: the mark, a title, a sentence, then the choice. */
function SignInColumn({ title, lede, children }: { title: string; lede: string; children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-canvas">
      <DemoBanner />
      <main id="main" className="mx-auto max-w-[600px] px-4 pb-16 pt-10 md:pt-16">
        <div className="app-enter text-center">
          <BrandMark size={56} className="mx-auto" />
          <h1 className="mt-6 text-[34px] font-semibold leading-[40px] tracking-[-0.022em] text-ink md:text-[40px] md:leading-[46px]">{title}</h1>
          <p className="mx-auto mt-3 max-w-[460px] text-[17px] leading-[26px] text-muted">{lede}</p>
        </div>
        {children}
      </main>
    </div>
  );
}

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
    <SignInColumn title="Sign in" lede="Use your organisation’s account. What you can see and do follows the role an administrator gave you.">
      <div className="app-enter mx-auto mt-10 max-w-[400px] text-center" style={{ animationDelay: '120ms' }}>
        {!runtime.loaded ? (
          <p role="status" className="flex items-center justify-center gap-2 text-muted">
            <Spinner /> Checking how this deployment signs people in…
          </p>
        ) : cfg ? (
          <button type="button" onClick={start} disabled={busy} className={buttonClass('primary', 'md', 'w-full text-base')}>
            {busy ? <Spinner className="text-white" /> : <Building2 className="h-4 w-4" aria-hidden />}
            Sign in with your organisation
          </button>
        ) : (
          <Notice tone="warn" className="text-left" title="Company sign-in is not configured">
            The API uses OIDC but publishes no client ID. Set OIDC_CLIENT_ID on the API server (see server/README.md).
          </Notice>
        )}
        {provider && <p className="mt-3 text-sm text-muted">You will be sent to {provider} and brought back here.</p>}
        {(error ?? runtime.error) && (
          <Notice tone="danger" className="mt-6 text-left" title="Cannot sign in">
            {error ?? runtime.error}
          </Notice>
        )}
        <p className="mt-12 text-sm text-muted">A label finds a battery. Your sign-in decides what you see of it. Every refusal is recorded with its reason.</p>
      </div>
    </SignInColumn>
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
    <SignInColumn
      title="Choose a demo role"
      lede="There are no passwords. The role decides what you can see and do, and every call checks it. Switch any time from the top bar."
    >
      {connectionError && (
        <Notice tone="danger" className="mt-8" title="Cannot sign in">
          {connectionError}
        </Notice>
      )}

      {/* An inset grouped list: white rows on the canvas, parted by a 2px gap rather than a rule. */}
      <ul className="mt-10 space-y-0.5 overflow-hidden rounded-2xl" aria-label="Demo roles">
        {ROLES.map((role, i) => {
          const user = users.find((u) => u.id === DEMO_USER_FOR_ROLE[role]);
          const scope = user?.siteScope ? (user.siteScope === 'all' ? 'all sites' : `${user.siteScope.length} site${user.siteScope.length === 1 ? '' : 's'}`) : null;
          return (
            <li key={role} className="anim-row" style={{ animationDelay: `${140 + i * 45}ms` }}>
              <button
                type="button"
                data-testid={`role-${role}`}
                onClick={() => {
                  setSessionUserId(DEMO_USER_FOR_ROLE[role]);
                  router.push(next);
                }}
                className="group flex w-full items-center gap-4 bg-white px-4 py-4 text-left transition-colors duration-150 ease-out hover:bg-[#FBF9F5] active:bg-[#F3EEE6] md:px-5"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-night text-[15px] font-semibold text-white" aria-hidden>
                  {initials(user?.name ?? ROLE_LABELS[role])}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold leading-6 text-ink">{ROLE_LABELS[role]}</span>
                  <span className="mt-0.5 block text-[15px] leading-[22px] text-ink-2">{ROLE_SUMMARIES[role]}</span>
                  <span className="mt-1 block text-[13px] leading-[18px] text-muted">
                    {user ? user.name : 'Synthetic user'} · {permissionsFor(role).length} permissions{scope && ` · ${scope}`}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted transition-transform duration-200 ease-out group-hover:translate-x-0.5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mx-auto mt-6 flex max-w-[480px] items-start gap-2.5 px-2 text-sm text-muted">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
        <p>
          <span className="font-semibold text-ink">{DATA_SOURCE === 'http' ? 'Development sign-in.' : 'Demonstration sign-in only.'}</span>{' '}
          {DATA_SOURCE === 'http'
            ? 'Anyone who can reach this API can act as any user. Production uses your identity provider (OIDC) and the same permission model.'
            : 'This is not authentication. A production deployment uses your identity provider (OIDC) and the same permission model.'}
        </p>
      </div>
    </SignInColumn>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}
