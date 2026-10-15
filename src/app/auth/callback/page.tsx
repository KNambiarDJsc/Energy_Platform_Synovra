'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BrandMark } from '@/components/app/Brand';
import { DemoBanner } from '@/components/app/DemoBanner';
import { Spinner } from '@/components/ui/States';
import { buttonClass } from '@/components/ui/buttonClass';
import { useRuntime } from '@/lib/hooks';
import { completeSignIn, type SignInResult } from '@/services/http/oidc';
import { setToken } from '@/services/http/session';

// The provider's code is single-use: share one exchange per callback URL (React may run effects twice).
const exchanges = new Map<string, Promise<SignInResult>>();

export default function AuthCallbackPage() {
  const router = useRouter();
  const runtime = useRuntime();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runtime.loaded) return;
    const cfg = runtime.oidc;
    if (!cfg) {
      // Adjusting state from an external system (the runtime document), once.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(runtime.error ?? 'This deployment is not set up for company sign-in.');
      return;
    }
    const href = window.location.href;
    let p = exchanges.get(href);
    if (!p) { p = completeSignIn(cfg, href); exchanges.set(href, p); }
    let live = true;
    p.then(async (r) => {
      await setToken(r.token, { expiresAt: r.expiresAt, idToken: r.idToken });
      if (live) router.replace(r.next);
    }).catch((e: unknown) => {
      if (live) setError(e instanceof Error ? e.message : 'Sign-in failed.');
    });
    return () => { live = false; };
  }, [runtime.loaded, runtime.oidc, runtime.error, router]);

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <DemoBanner />
      <main id="main" className="app-enter mx-auto max-w-[480px] px-4 pb-16 pt-14 text-center md:pt-24">
        <BrandMark size={56} className="mx-auto" />
        {error ? (
          <>
            <h1 className="mt-6 text-[34px] font-semibold leading-[40px] tracking-[-0.022em] text-ink">Sign-in did not finish</h1>
            <p className="mt-3 text-[17px] leading-[26px] text-ink" role="alert">{error}</p>
            <p className="mt-2 text-sm text-muted">If your organisation&apos;s account is new to Synovra, an administrator must add your email address first.</p>
            <Link href="/signin" className={buttonClass('primary', 'md', 'mt-8')}>Start again</Link>
          </>
        ) : (
          <div role="status" className="mt-8 flex items-center justify-center gap-3 text-[17px] text-ink">
            <Spinner />
            Finishing sign-in…
          </div>
        )}
      </main>
    </div>
  );
}
