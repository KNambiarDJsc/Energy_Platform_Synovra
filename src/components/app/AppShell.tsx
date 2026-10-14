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
import { cn } from '@/lib/format';
import { useRuntime, useSession, useSvcQuery } from '@/lib/hooks';
import { DEMO_USER_FOR_ROLE, setSessionUserId } from '@/services/session';
import { AssistantPanel } from './AssistantPanel';
import { Brand } from './Brand';
import { DemoBanner } from './DemoBanner';
import { NAV, navForPath, type NavItem } from './nav';

const ROLES = Object.keys(ROLE_LABELS) as Role[];

function useVisibleNav(): NavItem[] {
  const { can, has } = useSession();
  return NAV.filter((n) => can(n.permission) && (!n.feature || has(n.feature)));
}

function NotEnabled({ item }: { item: NavItem }) {
  return (
    <div role="alert" className="mx-auto max-w-xl rounded-lg border border-line bg-white p-6">
      <h1 className="text-xl font-semibold text-navy">{item.label} is not enabled on this deployment</h1>
      <p className="mt-2 text-sm text-ink">
        {item.purpose} This area needs an integration that this deployment does not have yet, so it is switched off rather than shown with empty data.
      </p>
      <div className="mt-4">
        <LinkButton href="/app/overview" variant="secondary">Back to overview</LinkButton>
      </div>
    </div>
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
    <nav aria-label="Primary" className="space-y-5">
      {groups.map(([group, list]) => (
        <div key={group}>
          <p className="eyebrow mb-1.5 px-3">{group}</p>
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
                      'flex min-h-[44px] items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                      active ? 'bg-navy text-white' : 'text-ink hover:bg-canvas',
                    )}
                  >
                    <n.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                    <span className="flex-1">{n.label}</span>
                    {n.href === '/app/alerts' && alertCount > 0 && (
                      <span
                        className={cn('rounded-full px-1.5 py-0.5 text-xs font-semibold', active ? 'bg-white text-navy' : 'bg-amber-50 text-amber-700')}
                        aria-label={`${alertCount} active alerts`}
                      >
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

function RoleSwitcher({ id, className, showLabel }: { id: string; className?: string; showLabel?: boolean }) {
  const { role } = useSession();
  const runtime = useRuntime();
  const toast = useToast();
  // With a real identity provider, who you are is not a dropdown.
  if (!role || runtime.authMode === 'oidc') return null;
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className={showLabel ? 'mb-1 block text-xs font-semibold uppercase tracking-wide text-muted' : 'sr-only'}>
        Demo role
      </label>
      <select
        id={id}
        value={role}
        className="input !min-h-[40px] py-1.5"
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

function AccessRestricted({ item }: { item: NavItem }) {
  const { role } = useSession();
  const allowed = ROLES.filter((r) => canRole(r, item.permission));
  return (
    <div role="alert" className="mx-auto max-w-xl rounded-lg border border-line bg-white p-6">
      <h1 className="text-xl font-semibold text-navy">{item.label} is not available to your role</h1>
      <p className="mt-2 text-sm text-ink">
        You are viewing as <strong>{role ? ROLE_LABELS[role] : 'unknown'}</strong>. {item.purpose}
      </p>
      {allowed.length > 0 && (
        <p className="mt-2 text-sm text-muted">Roles with access: {allowed.map((r) => ROLE_LABELS[r]).join(', ')}.</p>
      )}
      <div className="mt-4">
        <LinkButton href="/app/overview" variant="secondary">Back to overview</LinkButton>
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
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (session.ready && !session.user) router.replace(`/signin?next=${encodeURIComponent(pathname)}`);
  }, [session.ready, session.user, router, pathname]);

  useEffect(() => setMenuOpen(false), [pathname]);

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
    <div className="min-h-screen">
      <div className="no-print sticky top-0 z-40">
        <DemoBanner />
        <header className="flex h-14 items-center gap-3 border-b border-line bg-white px-3 md:px-5">
          <button
            type="button"
            className="-ml-1 rounded-md p-2 text-ink hover:bg-canvas lg:hidden"
            aria-label="Open navigation menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <Brand href="/app/overview" className="lg:hidden" />
          <Link href="/app/batteries" className="ml-auto rounded-md p-2 text-ink hover:bg-canvas md:hidden" aria-label="Search batteries">
            <Search className="h-5 w-5" aria-hidden />
          </Link>
          <form
            role="search"
            className="relative ml-auto hidden max-w-md flex-1 md:ml-0 md:block lg:ml-[260px]"
            onSubmit={(e) => {
              e.preventDefault();
              const q = query.trim();
              router.push(q ? `/app/batteries?q=${encodeURIComponent(q)}` : '/app/batteries');
            }}
          >
            <label htmlFor="global-search" className="sr-only">
              Search batteries by label, serial, QR reference or alias
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              id="global-search"
              type="search"
              className="input pl-9"
              placeholder="Search label, serial, QR reference or alias"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          <div className="ml-auto flex items-center gap-2">
            {canAssistant && (
              <Button variant="secondary" size="sm" icon={<Bot className="h-4 w-4" aria-hidden />} onClick={() => setAssistantOpen(true)}>
                <span className="hidden sm:inline">Assistant</span>
                <span className="sr-only sm:hidden">Open assistant</span>
              </Button>
            )}
            <div className="hidden w-56 sm:block">
              <RoleSwitcher id="role-switch" />
            </div>
            <Link
              href="/signin"
              className="rounded-md p-2 text-muted hover:bg-canvas hover:text-ink"
              aria-label="Switch demo user or leave the demo"
              onClick={() => setSessionUserId(null)}
            >
              <LogOut className="h-5 w-5" aria-hidden />
            </Link>
          </div>
        </header>
      </div>

      <aside
        className="no-print fixed bottom-0 left-0 top-[88px] z-30 hidden w-[248px] overflow-y-auto border-r border-line bg-white px-3 py-4 lg:block"
        aria-label="Sidebar"
      >
        <div className="mb-5 px-3">
          <Brand href="/app/overview" />
        </div>
        <NavList items={items} pathname={pathname} alertCount={alertCount} />
        <div className="mt-6 rounded-md bg-canvas p-3 text-xs text-muted">
          <p className="font-semibold text-ink">{session.user.name}</p>
          <p>{ROLE_LABELS[session.user.role]}</p>
          <p className="mt-1">
            Site scope: {session.user.siteScope === 'all' ? 'all sites in tenant' : `${session.user.siteScope.length} site(s)`}
          </p>
        </div>
      </aside>

      <main id="main" className="px-4 pb-28 pt-6 md:px-6 lg:ml-[248px] lg:px-8 lg:pb-10" tabIndex={-1}>
        <div className="mx-auto max-w-[1280px]">
          {/* Role switcher also on phones, where the top bar is crowded */}
          <RoleSwitcher id="role-switch-m" showLabel className="no-print mb-4 sm:hidden" />
          {disabled ? <NotEnabled item={disabled} /> : restricted ? <AccessRestricted item={restricted} /> : <Suspense fallback={<LoadingBlock />}>{children}</Suspense>}
        </div>
      </main>

      <nav
        aria-label="Quick navigation"
        className="no-print fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {mobileTabs.map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? 'page' : undefined}
              className={cn('relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', active ? 'text-teal-800' : 'text-muted')}
            >
              <n.icon className="h-5 w-5" aria-hidden />
              {n.label.split(' ')[0]}
              {n.href === '/app/alerts' && alertCount > 0 && (
                <span className="absolute right-[28%] top-1.5 rounded-full bg-amber-50 px-1 text-[10px] font-bold text-amber-700 ring-1 ring-[#E8D6A8]">{alertCount}</span>
              )}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted"
        >
          <Menu className="h-5 w-5" aria-hidden />
          More
        </button>
      </nav>

      <Drawer open={menuOpen} onOpenChange={setMenuOpen} title="Menu" description={`Signed in as ${session.user.name}, ${ROLE_LABELS[session.user.role]}`}>
        <NavList items={items} pathname={pathname} alertCount={alertCount} onNavigate={() => setMenuOpen(false)} />
      </Drawer>

      {canAssistant && (
        <AssistantPanel open={assistantOpen} onOpenChange={setAssistantOpen} batteryId={batteryId} suggestions={suggestions.data ?? []} />
      )}
    </div>
  );
}

export function RoleChip({ role }: { role: Role }) {
  return <Badge tone="teal">{ROLE_LABELS[role]}</Badge>;
}
