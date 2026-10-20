'use client';
import { LogOut, Menu, MessageCircle, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { AskPanel } from '@/components/customer/AskPanel';
import { Button, LinkButton } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/States';
import { Drawer } from '@/components/ui/Overlay';
import { cn, initials } from '@/lib/format';
import { useRuntime, useSession } from '@/lib/hooks';
import { signOutUrl } from '@/services/http/oidc';
import { clearApiSession, currentIdToken } from '@/services/http/session';
import { setSessionUserId } from '@/services/session';
import { Brand } from './Brand';
import { DemoBanner } from './DemoBanner';
import { NAV, navForPath, type NavItem } from './nav';

const SIDEBAR = 'lg:w-[236px] xl:w-[264px]';

function Blocked({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="alert" className="card mx-auto mt-6 max-w-xl p-8 md:mt-12">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <div className="mt-3 space-y-2 text-base text-ink">{children}</div>
      <div className="mt-6"><LinkButton href="/app/home" variant="secondary">Back to home</LinkButton></div>
    </div>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary">
      <ul className="space-y-0.5">
        {items.map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex min-h-[44px] items-center gap-3 rounded-md px-3 text-[15px] transition-[background-color,color] duration-150',
                  active ? 'bg-fill-2 font-semibold text-ink before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-copper' : 'font-medium text-ink-2 hover:bg-fill hover:text-ink',
                )}
              >
                <n.icon className={cn('h-[18px] w-[18px] shrink-0 transition-colors', active ? 'text-copper' : 'text-muted group-hover:text-ink-2')} strokeWidth={1.85} aria-hidden />
                <span className="flex-1">{n.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Demo: back to the sign-in. Company sign-in: end the platform session, then the provider's if it supports that. */
function SignOut() {
  const runtime = useRuntime();
  const cls = 'flex h-10 w-10 items-center justify-center rounded-full text-ink-2 transition-[background-color,color,transform] duration-150 hover:bg-fill hover:text-ink active:scale-95';
  if (runtime.authMode === 'oidc' && runtime.oidc) {
    const cfg = runtime.oidc;
    return (
      <button
        type="button"
        className={cls}
        aria-label="Sign out"
        onClick={async () => {
          const url = await signOutUrl(cfg, currentIdToken(), `${window.location.origin}/signin`);
          clearApiSession();
          window.location.assign(url ?? '/signin');
        }}
      >
        <LogOut className="h-[18px] w-[18px]" aria-hidden />
      </button>
    );
  }
  return (
    <Link href="/signin" className={cls} aria-label="Sign out of the demo" onClick={() => { setSessionUserId(null); clearApiSession(); }}>
      <LogOut className="h-[18px] w-[18px]" aria-hidden />
    </Link>
  );
}

function Account() {
  const { user } = useSession();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-night text-[13px] font-semibold text-white" aria-hidden>{initials(user.name)}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
        <p className="text-xs text-muted">{user.siteScope === 'all' ? 'All sites' : `${user.siteScope.length} site${user.siteScope.length === 1 ? '' : 's'}`}</p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const items = NAV.filter((n) => session.can(n.permission));

  // Any screen can hand Ask a question: it opens with that question answered.
  useEffect(() => {
    const onAsk = (e: Event) => {
      const prompt = (e as CustomEvent<string>).detail;
      if (typeof prompt !== 'string' || !prompt.trim()) return;
      setPrompts((p) => [...p, prompt.trim()]);
      setAskOpen(true);
    };
    window.addEventListener('synovra:ask', onAsk);
    return () => window.removeEventListener('synovra:ask', onAsk);
  }, []);

  useEffect(() => {
    if (session.ready && !session.user) router.replace(`/signin?next=${encodeURIComponent(pathname)}`);
  }, [session.ready, session.user, router, pathname]);

  // Close the mobile menu after navigation (state adjusted during render, not in an effect).
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
    setPrompts([]); // an answer belongs to the screen it was asked on
  }

  const current = navForPath(pathname);
  const restricted = current && session.user && !session.can(current.permission) ? current : null;
  const batteryMatch = /^\/app\/batteries\/([^/]+)$/.exec(pathname);
  const batteryId = batteryMatch ? batteryMatch[1]! : null;

  if (!session.ready || !session.user) {
    return <div className="mx-auto max-w-3xl p-8"><LoadingBlock label="Opening your batteries" /></div>;
  }

  return (
    <div className="min-h-[100dvh]">
      <div className="no-print sticky top-0 z-40">
        <DemoBanner />
        <header className="flex h-[60px] items-center gap-2 bg-canvas px-3 md:px-6 lg:pl-[260px] lg:pr-8 xl:pl-[288px]">
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-fill lg:hidden" aria-label="Open navigation menu" onClick={() => setMenuOpen(true)}>
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <Brand href="/app/home" className="lg:hidden" />
          <Link href="/app/batteries" className="ml-auto flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-fill md:hidden" aria-label="Find a battery">
            <Search className="h-5 w-5" aria-hidden />
          </Link>
          <form
            role="search"
            className="relative ml-auto hidden max-w-md flex-1 md:ml-4 md:block lg:ml-0"
            onSubmit={(e) => {
              e.preventDefault();
              const q = query.trim();
              router.push(q ? `/app/batteries?q=${encodeURIComponent(q)}` : '/app/batteries');
            }}
          >
            <label htmlFor="global-search" className="sr-only">Find a battery by its label or serial number</label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input id="global-search" type="search" className="input !min-h-[40px] rounded-full border-transparent bg-fill py-1.5 pl-10 focus:bg-white" placeholder="Find a battery" value={query} onChange={(e) => setQuery(e.target.value)} />
          </form>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <Button variant="secondary" size="sm" className="!min-h-[40px]" icon={<MessageCircle className="h-4 w-4" aria-hidden />} onClick={() => setAskOpen(true)}>
              Ask
            </Button>
            <SignOut />
          </div>
        </header>
      </div>

      <aside className={cn('no-print fixed bottom-0 left-0 top-8 z-50 hidden flex-col overflow-y-auto bg-canvas px-3 pb-4 pt-4 lg:flex', SIDEBAR)} aria-label="Sidebar">
        <div className="mb-6 flex h-[44px] items-center px-3"><Brand href="/app/home" /></div>
        <NavList items={items} pathname={pathname} />
        <div className="mt-auto pt-6"><Account /></div>
      </aside>

      <main id="main" className="px-4 pb-28 pt-3 md:px-6 lg:ml-[236px] lg:px-8 xl:ml-[264px] lg:pb-14 lg:pt-5" tabIndex={-1}>
        <div className="mx-auto max-w-[1200px]">
          {restricted ? (
            <Blocked title={`${restricted.label} is not available to you`}><p>{restricted.purpose}</p></Blocked>
          ) : (
            <Suspense fallback={<LoadingBlock />}>
              <div key={pathname} className="app-enter">{children}</div>
            </Suspense>
          )}
        </div>
      </main>

      <nav aria-label="Quick navigation" className="no-print fixed inset-x-0 bottom-0 z-40 flex bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined} className={cn('flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[13px] font-medium transition-colors', active ? 'text-copper-700' : 'text-muted')}>
              <n.icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.1 : 1.8} aria-hidden />
              {n.label}
            </Link>
          );
        })}
      </nav>

      <Drawer open={menuOpen} onOpenChange={setMenuOpen} title="Menu" description={`Signed in as ${session.user.name}`}>
        <NavList items={items} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
      </Drawer>

      <AskPanel open={askOpen} onOpenChange={setAskOpen} batteryId={batteryId} prompts={prompts} onAsk={(q) => setPrompts((p) => [...p, q])} />
    </div>
  );
}
