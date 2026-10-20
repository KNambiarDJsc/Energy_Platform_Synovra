import { Battery, ClipboardList, FileText, House, type LucideIcon } from 'lucide-react';
import type { Permission } from '@/domain/permissions';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  /** One line shown in the menu. */
  purpose: string;
}

/** The customer's whole product: how everything is doing, each battery, what to do next, and the paperwork. */
export const NAV: NavItem[] = [
  { href: '/app/home', label: 'Home', icon: House, permission: 'battery.read', purpose: 'How every battery is doing, what changed and what needs attention.' },
  { href: '/app/batteries', label: 'Batteries', icon: Battery, permission: 'battery.read', purpose: 'Every battery, its condition and its record.' },
  { href: '/app/actions', label: 'Actions', icon: ClipboardList, permission: 'battery.read', purpose: 'What needs doing now, what is planned and what is done.' },
  { href: '/app/reports', label: 'Reports', icon: FileText, permission: 'report.generate', purpose: 'An evidence-backed data report for ESG and internal paperwork.' },
];

export function navForPath(pathname: string): NavItem | undefined {
  return NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
}
