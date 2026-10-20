'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { Site } from '@/domain/types';
import { useSvcQuery } from '@/lib/hooks';
import type { BatteryPassport, SiteView } from '@/services/types';
import { customerName } from './model';

export interface CustomerOption { tenantId: string; name: string; sites: Site[] }

/** The customers and sites this person may see, and the one chosen in the address (?customer=&site=). */
export function useCustomerScope() {
  const q = useSvcQuery(['customer', 'facets'], (s) => s.batteries.facets());
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const customers = useMemo<CustomerOption[]>(() => {
    const by = new Map<string, Site[]>();
    for (const s of q.data?.sites ?? []) by.set(s.tenantId, [...(by.get(s.tenantId) ?? []), s]);
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([tenantId, sites]) => ({ tenantId, name: customerName(tenantId), sites }));
  }, [q.data]);

  const wantedSite = params.get('site');
  const wantedCustomer = params.get('customer');
  const customer = customers.find((c) => c.tenantId === wantedCustomer) ?? customers.find((c) => c.sites.some((s) => s.id === wantedSite)) ?? customers[0] ?? null;
  const site = customer?.sites.find((s) => s.id === wantedSite) ?? null; // null means every site of the customer

  const choose = useCallback((next: { customer?: string; site?: string | null }, extra?: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    if (next.customer !== undefined) { sp.set('customer', next.customer); sp.delete('site'); }
    if (next.site !== undefined) { if (next.site) sp.set('site', next.site); else sp.delete('site'); }
    for (const [k, v] of Object.entries(extra ?? {})) sp.set(k, v);
    router.replace(`${pathname}${sp.toString() ? `?${sp.toString()}` : ''}`, { scroll: false });
  }, [params, pathname, router]);

  return { query: q, customers, customer, site, choose };
}

export interface SiteData {
  passports: BatteryPassport[];
  siteViews: SiteView[];
  snapshotAt: string;
}

/** Every battery record at the chosen sites, the site structure, and the snapshot time. Read-only. */
export function useSiteData(siteIds: string[]) {
  return useSvcQuery<SiteData>(['customer', 'site-data', ...siteIds], async (s) => {
    const [lists, siteViews, home] = await Promise.all([
      Promise.all(siteIds.map((id) => s.batteries.list({ siteId: id }))),
      s.deployments.sites(),
      s.overview.home(),
    ]);
    const ids = lists.flat().map((b) => b.id);
    const passports = await Promise.all(ids.map((id) => s.batteries.get(id)));
    return { passports, siteViews: siteViews.filter((v) => siteIds.includes(v.site.id)), snapshotAt: home.snapshotAt };
  }, { enabled: siteIds.length > 0 });
}
