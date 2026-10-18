'use client';
import { Bot, LogOut, Menu, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button, LinkButton } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/States';
import { Drawer } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { can as canRole, ROLE_LABELS, ROLE_SUMMARIES } from '@/domain/permissions';
import type { Role } from '@/domain/types';
import { cn, initials } from '@/lib/format';
import { useRuntime, useSession, useSvcQuery } from '@/lib/hooks';
import { signOutUrl } from '@/services/http/oidc';
import { clearApiSession, currentIdToken } from '@/services/http/session';
import { DEMO_USER_FOR_ROLE, setSessionUserId } from '@/services/session';
import { AssistantPanel } from './AssistantPanel';
import { Brand } from './Brand';
import { DemoBanner } from './DemoBanner';
import { NAV, navForPath, type NavItem } from './nav';

const ROLES = Object.keys(ROLE_LABELS) as Role[];
const SIDEBAR = 'lg:w-[264px]';

function useVisibleNav(): NavItem[] {
  const { can, has } = useSession();
  return NAV.filter((n) => can(n.permission) && (!n.feature || has(n.feature)));
}

function Blocked({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="alert" className="card mx-auto mt-6 max-w-xl p-8 md:mt-12">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <div className="mt-3 space-y-2 text-base text-ink">{children}</div>
      <div className="mt-6">
        <LinkButton href="/app/overview" variant="secondary">Back to overview</LinkButton>
      </div>
    </div>
  );
}

function NotEnabled({ item }: { item: NavItem }) {
  return (
    <Blocked title={`${item.label} is not enabled on this deployment`}>
      <p>
        {item.purpose} This area needs an integration that this deployment does not have yet, so it is switched off rather than shown with empty data.
      </p>
    </Blocked>
  );
}

function AccessRestricted({ item }: { item: NavItem }) {
  const { role } = useSession();
  const allowed = ROLES.filter((r) => canRole(r, item.permission));
  return (
    <Blocked title={`${item.label} is not available to your role`}>
      <p>
        You are viewing as <strong>{role ? ROLE_LABELS[role] : 'unknown'}</strong>. {item.purpose}
      </p>
      {allowed.length > 0 && <p className="text-sm text-muted">Roles with access: {allowed.map((r) => ROLE_LABELS[r]).join(', ')}.</p>}
    </Blocked>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ items, pathname, alertCount, onNavigate }: { items: NavItem[]; pathname: string; alertCount: number; onNavigate?: () => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    items.forEach((i) => map.set(i.group, [...(map.get(i.group) ?? []), i]));
    return [...map.entries()];
  }, [items]);
  return (
    <nav aria-label="Primary" className="space-y-6">
      {groups.map(([group, list]) => (
        <div key={group}>
          <p className="mb-1 px-3 text-[13px] font-semibold text-muted">{group}</p>
          <ul className="space-y-0.5">
            {list.map((n) => {
              const active = isActive(pathname, n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex min-h-[40px] items-center gap-3 rounded-md px-3 text-[15px] transition-[background-color,color] duration-150',
                      active ? 'bg-fill-2 font-semibold text-ink' : 'font-medium text-ink-2 hover:bg-fill hover:text-ink',
                    )}
                  >
                    <n.icon className={cn('h-[18px] w-[18px] shrink-0 transition-colors', active ? 'text-copper' : 'text-muted group-hover:text-ink-2')} strokeWidth={1.85} aria-hidden />
                    <span className="flex-1">{n.label}</span>
                    {n.href === '/app/alerts' && alertCount > 0 && (
                      <span className="num rounded-full bg-amber-50 px-2 text-xs font-semibold leading-5 text-amber-700" aria-label={`${alertCount} active alerts`}>
                        {alertCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Demo: back to the role picker. Company sign-in: end the platform session, then the provider's if it supports that. */
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
    <Link
      href="/signin"
      className={cls}
      aria-label="Switch demo user or leave the demo"
      onClick={() => { setSessionUserId(null); clearApiSession(); }}
    >
      <LogOut className="h-[18px] w-[18px]" aria-hidden />
    </Link>
  );
}

function RoleSwitcher({ id, className, showLabel }: { id: string; className?: string; showLabel?: boolean }) {
  const { role } = useSession();
  const runtime = useRuntime();
  const toast = useToast();
  // With a real identity provider, who you are is not a dropdown.
  if (!role || runtime.authMode === 'oidc') return null;
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className={showLabel ? 'mb-1.5 block text-[13px] font-medium text-muted' : 'sr-only'}>
        Demo role
      </label>
      <select
        id={id}
        value={role}
        className={cn('input !min-h-[40px] rounded-full border-transparent bg-fill py-1.5 pl-4 font-medium hover:bg-fill-2 focus:bg-white', showLabel ? 'w-full' : 'w-auto')}
        onChange={(e) => {
          const next = e.target.value as Role;
          setSessionUserId(DEMO_USER_FOR_ROLE[next]);
          toast.info(`Now acting as ${ROLE_LABELS[next]}. ${ROLE_SUMMARIES[next]}`);
        }}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </div>
  );
}

function Account() {
  const { user } = useSession();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-night text-[13px] font-semibold text-white" aria-hidden>
        {initials(user.name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
        <p className="text-xs text-muted">
          {ROLE_LABELS[user.role]} ·{' '}
          <span className="whitespace-nowrap">{user.siteScope === 'all' ? 'all sites' : `${user.siteScope.length} site${user.siteScope.length === 1 ? '' : 's'}`}</span>
        </p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const items = useVisibleNav();
  const [menuOpen, setMenuOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Any screen can hand the assistant a question: it opens with that question asked, and a person reads the answer.
  useEffect(() => {
    const onAsk = (e: Event) => {
      const prompt = (e as CustomEvent<string>).detail;
      if (typeof prompt !== 'string' || !prompt.trim()) return;
      setPendingPrompt(prompt);
      setAssistantOpen(true);
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
  }

  const canAlerts = session.can('alert.read') && session.has('alerts');
  const canAssistant = session.can('assistant.use') && session.has('assistant');
  const alerts = useSvcQuery(['shell', 'alerts'], (s) => s.alerts.list({ active: true }), { enabled: canAlerts });
  const alertCount = alerts.data?.length ?? 0;
  const suggestions = useSvcQuery(['shell', 'suggestions'], async (s) => s.assistant.suggestions(), { enabled: canAssistant });

  const current = navForPath(pathname);
  const restricted = current && session.user && !session.can(current.permission) ? current : null;
  const disabled = current?.feature && !session.has(current.feature) ? current : null;
  const batteryMatch = /^\/app\/batteries\/([^/]+)$/.exec(pathname);
  const batteryId = batteryMatch && batteryMatch[1] !== 'new' ? batteryMatch[1] : null;

  if (!session.ready || !session.user) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <LoadingBlock label="Opening workspace" />
      </div>
    );
  }

  const mobileTabs = items.filter((n) => ['/app/overview', '/app/batteries', '/app/alerts', '/app/tests'].includes(n.href)).slice(0, 3);

  return (
    <div className="min-h-[100dvh]">
      <div className="no-print sticky top-0 z-40">
        <DemoBanner />
        <header className="flex h-[60px] items-center gap-2 bg-canvas px-3 md:px-6 lg:pl-[288px] lg:pr-8">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-fill lg:hidden"
            aria-label="Open navigation menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <Brand href="/app/overview" className="lg:hidden" />
          <Link
            href="/app/batteries"
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-fill md:hidden"
            aria-label="Search batteries"
          >
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
            <label htmlFor="global-search" className="sr-only">
              Search batteries by label, serial, QR reference or alias
            </label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              id="global-search"
              type="search"
              className="input !min-h-[40px] rounded-full border-transparent bg-fill py-1.5 pl-10 focus:bg-white"
              placeholder="Search label, serial, QR reference or alias"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {canAssistant && (
              <Button variant="secondary" size="sm" className="!min-h-[40px]" icon={<Bot className="h-4 w-4" aria-hidden />} onClick={() => setAssistantOpen(true)}>
                <span className="hidden sm:inline">Assistant</span>
                <span className="sr-only sm:hidden">Open assistant</span>
              </Button>
            )}
            <div className="hidden sm:block">
              <RoleSwitcher id="role-switch" />
            </div>
            <SignOut />
          </div>
        </header>
      </div>

      <aside
        className={cn('no-print fixed bottom-0 left-0 top-8 z-50 hidden flex-col overflow-y-auto bg-canvas px-3 pb-4 pt-4 lg:flex', SIDEBAR)}
        aria-label="Sidebar"
      >
        <div className="mb-6 flex h-[44px] items-center px-3">
          <Brand href="/app/overview" />
        </div>
        <NavList items={items} pathname={pathname} alertCount={alertCount} />
        <div className="mt-auto pt-6">
          <Account />
        </div>
      </aside>

      <main id="main" className="px-4 pb-28 pt-3 md:px-6 lg:ml-[264px] lg:px-8 lg:pb-14 lg:pt-5" tabIndex={-1}>
        <div className="mx-auto max-w-[1200px]">
          {/* Role switcher also on phones, where the top bar is crowded */}
          <RoleSwitcher id="role-switch-m" showLabel className="no-print mb-5 sm:hidden" />
          {disabled ? (
            <NotEnabled item={disabled} />
          ) : restricted ? (
            <AccessRestricted item={restricted} />
          ) : (
            <Suspense fallback={<LoadingBlock />}>
              <div key={pathname} className="app-enter">{children}</div>
            </Suspense>
          )}
        </div>
      </main>

      <nav
        aria-label="Quick navigation"
        className="no-print fixed inset-x-0 bottom-0 z-40 flex bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {mobileTabs.map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? 'page' : undefined}
              className={cn('relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[12px] font-medium transition-colors', active ? 'text-copper-700' : 'text-muted')}
            >
              <n.icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.1 : 1.8} aria-hidden />
              {n.label.split(' ')[0]}
              {n.href === '/app/alerts' && alertCount > 0 && (
                <span className="num absolute right-[26%] top-1.5 rounded-full bg-critical px-1.5 text-[11px] font-semibold leading-4 text-white">{alertCount}</span>
              )}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[12px] font-medium text-muted"
        >
          <Menu className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden />
          More
        </button>
      </nav>

      <Drawer open={menuOpen} onOpenChange={setMenuOpen} title="Menu" description={`Signed in as ${session.user.name}, ${ROLE_LABELS[session.user.role]}`}>
        <NavList items={items} pathname={pathname} alertCount={alertCount} onNavigate={() => setMenuOpen(false)} />
      </Drawer>

      {canAssistant && (
        <AssistantPanel
          open={assistantOpen}
          onOpenChange={setAssistantOpen}
          batteryId={batteryId}
          suggestions={suggestions.data ?? []}
          pendingPrompt={pendingPrompt}
          onPendingSent={() => setPendingPrompt(null)}
        />
      )}
    </div>
  );
}

export function RoleChip({ role }: { role: Role }) {
  return <Badge tone="teal">{ROLE_LABELS[role]}</Badge>;
}
