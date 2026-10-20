import {
  Activity, Bell, Boxes, Building2, Brain, FileText, FlaskConical, House, LayoutDashboard, MapPinned, PackagePlus, Settings, Battery, Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@/domain/permissions';
import type { FeatureName } from '@/lib/runtime';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  /** Areas that only some deployments offer (see src/lib/runtime.ts). */
  feature?: FeatureName;
  group: string;
  /** One line shown on the access-restricted screen. */
  purpose: string;
}

export const NAV: NavItem[] = [
  { href: '/app/home', label: 'Home', icon: House, permission: 'battery.read', group: 'Operate', purpose: 'How every battery is doing, what changed and what needs attention.' },
  { href: '/app/customer', label: 'Customer demo', icon: Building2, permission: 'battery.read', group: 'Customer', purpose: 'The customer view: fleet, battery records, requests and the ESG data report.' },
  { href: '/app/overview', label: 'Overview', icon: LayoutDashboard, permission: 'battery.read', group: 'Operate', purpose: 'Fleet position, work waiting and data completeness.' },
  { href: '/app/batteries', label: 'Batteries', icon: Battery, permission: 'battery.read', group: 'Operate', purpose: 'Every battery record and its passport.' },
  { href: '/app/alerts', label: 'Alerts & tasks', icon: Bell, permission: 'alert.read', feature: 'alerts', group: 'Operate', purpose: 'Alerts, acknowledgement and service tasks.' },
  { href: '/app/intake', label: 'Intake & import', icon: PackagePlus, permission: 'battery.create', group: 'Lifecycle', purpose: 'Register batteries and import spreadsheets.' },
  { href: '/app/tests', label: 'Tests', icon: FlaskConical, permission: 'test.read', group: 'Lifecycle', purpose: 'Test sessions and engineering review.' },
  { href: '/app/restoration', label: 'Restoration', icon: Wrench, permission: 'restoration.read', group: 'Lifecycle', purpose: 'Restoration batches, attempts and results.' },
  { href: '/app/inventory', label: 'Inventory', icon: Boxes, permission: 'inventory.read', group: 'Fleet', purpose: 'Where every battery is in its lifecycle.' },
  { href: '/app/deployments', label: 'Deployments', icon: MapPinned, permission: 'inventory.read', group: 'Fleet', purpose: 'Sites, strings and slot assignments.' },
  { href: '/app/monitoring', label: 'Monitoring', icon: Activity, permission: 'telemetry.read', feature: 'monitoring', group: 'Fleet', purpose: 'Gateways, sensors and synthetic telemetry.' },
  { href: '/app/reports', label: 'Reports', icon: FileText, permission: 'report.generate', group: 'Insight', purpose: 'Evidence-referenced reports and exports.' },
  { href: '/app/intelligence', label: 'Intelligence', icon: Brain, permission: 'prediction.read', feature: 'intelligence', group: 'Insight', purpose: 'Shadow-mode model outputs for review.' },
  { href: '/app/admin', label: 'Administration', icon: Settings, permission: 'admin.read', group: 'Platform', purpose: 'Users, mappings, templates and audit.' },
];

export function navForPath(pathname: string): NavItem | undefined {
  return NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
}
