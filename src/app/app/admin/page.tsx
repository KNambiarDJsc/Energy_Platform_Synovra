'use client';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Notice, PageHeader, Section } from '@/components/ui/Layout';
import { ReasonDialog } from '@/components/ui/ReasonDialog';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Tabs';
import { ROLE_LABELS } from '@/domain/permissions';
import type { AuditEvent, Role, User } from '@/domain/types';
import { formatDateTime, titleCase } from '@/lib/format';
import { useAction, useSession, useSvcQuery } from '@/lib/hooks';
import { DEMO_USER_FOR_ROLE, setSessionUserId } from '@/services/session';

function UsersTab() {
  const session = useSession();
  const q = useSvcQuery(['admin', 'users'], (s) => s.admin.users());
  const tenants = useSvcQuery(['admin', 'tenants'], (s) => s.admin.tenants());
  const toggle = useAction<{ id: string; active: boolean }, unknown>((s, a) => s.admin.setUserActive(a.id, a.active), { success: 'User updated.' });
  const cols: Column<User>[] = [
    { key: 'name', header: 'Name', mobile: 'title', sort: (u) => u.name, cell: (u) => <span>{u.name}<span className="block text-xs text-muted">{u.title}</span></span> },
    { key: 'role', header: 'Role', sort: (u) => u.role, cell: (u) => ROLE_LABELS[u.role] },
    { key: 'tenant', header: 'Tenant', cell: (u) => tenants.data?.find((t) => t.id === u.tenantId)?.name ?? u.tenantId },
    { key: 'scope', header: 'Site scope', cell: (u) => (u.siteScope === 'all' ? 'All sites in tenant' : `${u.siteScope.length} site(s)`) },
    { key: 'active', header: 'Status', cell: (u) => <Badge tone={u.active ? 'green' : 'neutral'}>{u.active ? 'Active' : 'Inactive'}</Badge> },
    {
      key: 'act', header: 'Action', mobile: 'show',
      cell: (u) =>
        session.can('admin.manage') && u.id !== session.user?.id ? (
          <Button size="sm" variant="secondary" onClick={() => toggle.mutate({ id: u.id, active: !u.active })}>{u.active ? 'Deactivate' : 'Activate'}</Button>
        ) : null,
    },
  ];
  return (
    <QueryView query={q} skeleton={<LoadingBlock rows={4} />}>
      {(rows) => <DataTable caption="Users" columns={cols} rows={rows} rowKey={(u) => u.id} pageSize={12} />}
    </QueryView>
  );
}

function ConfigTab() {
  const families = useSvcQuery(['admin', 'families'], (s) => s.admin.families());
  const protocols = useSvcQuery(['admin', 'protocols'], (s) => s.admin.protocols());
  const templates = useSvcQuery(['admin', 'templates'], (s) => s.admin.importTemplates());
  const mappings = useSvcQuery(['admin', 'mappings'], (s) => s.admin.sensorMappings());
  const notifications = useSvcQuery(['admin', 'notifications'], (s) => s.admin.notifications());
  const session = useSession();
  const setN = useAction<{ id: string; enabled: boolean }, unknown>((s, a) => s.admin.setNotification(a.id, a.enabled), { success: 'Notification setting saved.' });
  return (
    <div className="space-y-6">
      <Section title="Battery families">
        <QueryView query={families} skeleton={<LoadingBlock rows={2} />}>
          {(rows) => (
            <ul className="divide-y divide-line text-sm">
              {rows.map((f) => (
                <li key={f.id} className="py-2.5">
                  <span className="font-medium text-navy">{f.manufacturer} {f.model}</span>
                  <span className="block text-muted">{f.chemistry} · {f.unitType} · {f.ratedVoltageV} V / {f.ratedCapacityAh} Ah · {f.ratingConditions}</span>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Section>
      <Section title="Test protocol revisions">
        <QueryView query={protocols} skeleton={<LoadingBlock rows={2} />}>
          {(rows) => (
            <ul className="divide-y divide-line text-sm">
              {rows.map((p) => (
                <li key={p.id} className="py-2.5">
                  <span className="font-medium text-navy">{p.name} {p.revision}</span>{' '}
                  <Badge tone={p.status === 'approved' ? 'green' : 'amber'}>{p.status === 'approved' ? 'Approved' : 'Placeholder'}</Badge>
                  <span className="block text-muted">{p.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Section>
      <Section title="Import mapping templates">
        <QueryView query={templates} skeleton={<LoadingBlock rows={2} />}>
          {(rows) => (
            <ul className="divide-y divide-line text-sm">
              {rows.map((t) => (
                <li key={t.id} className="py-2.5"><span className="font-medium text-navy">{t.name} v{t.version}</span><span className="block text-muted">{t.description}</span></li>
              ))}
            </ul>
          )}
        </QueryView>
      </Section>
      <Section title="Sensor-to-slot mappings" description="Mappings are time-bound. Changing one never rewrites history.">
        <QueryView query={mappings} skeleton={<LoadingBlock rows={3} />}>
          {(rows) => (
            <ul className="divide-y divide-line text-sm">
              {rows.slice(0, 12).map((m) => (
                <li key={m.assignment.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span><span className="mono">{m.sensor.serial}</span> <span className="text-muted">→ {m.slotLabel ?? 'unmapped'} · {m.siteName}</span></span>
                  <span className="flex items-center gap-2">
                    <Badge tone={m.assignment.mappingQuality === 'verified' ? 'green' : 'amber'}>{m.assignment.mappingQuality === 'verified' ? 'Verified' : 'Unverified'}</Badge>
                    {m.assignment.endAt && <Badge>Ended</Badge>}
                  </span>
                </li>
              ))}
              {rows.length > 12 && <li className="py-2.5 text-muted">{rows.length - 12} more not shown.</li>}
            </ul>
          )}
        </QueryView>
      </Section>
      <Section title="Notification settings" description="Stored only. No email or messaging service is connected.">
        <QueryView query={notifications} skeleton={<LoadingBlock rows={2} />}>
          {(rows) => (
            <ul className="divide-y divide-line text-sm">
              {rows.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-3 py-2.5">
                  <label htmlFor={`n-${n.id}`}>{n.label} <span className="text-muted">({n.channel === 'email' ? 'email' : 'in-app'})</span></label>
                  <input
                    id={`n-${n.id}`}
                    type="checkbox"
                    className="h-5 w-5"
                    checked={n.enabled}
                    disabled={!session.can('admin.manage')}
                    onChange={(e) => setN.mutate({ id: n.id, enabled: e.target.checked })}
                  />
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Section>
    </div>
  );
}

function AuditTab() {
  const [outcome, setOutcome] = useState<'' | 'denied'>('');
  const q = useSvcQuery(['admin', 'audit', outcome], (s) => s.admin.audit(outcome ? { outcome } : {}));
  const cols: Column<AuditEvent>[] = [
    { key: 'at', header: 'When', mobile: 'title', sort: (a) => a.at, cell: (a) => formatDateTime(a.at) },
    { key: 'who', header: 'Who', cell: (a) => <span>{a.actorName}<span className="block text-xs text-muted">{a.role === 'system' ? 'System' : ROLE_LABELS[a.role as Role]}</span></span> },
    { key: 'action', header: 'Action', cell: (a) => <span className="mono">{a.action}</span> },
    { key: 'entity', header: 'Record', cell: (a) => <span className="mono text-xs">{a.entityKind} {a.entityId.slice(0, 14)}</span> },
    { key: 'sum', header: 'Detail', cell: (a) => a.summary },
    { key: 'out', header: 'Outcome', cell: (a) => <Badge tone={a.outcome === 'denied' ? 'red' : 'green'}>{a.outcome === 'denied' ? 'Denied' : 'Recorded'}</Badge> },
  ];
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant={outcome === '' ? 'primary' : 'secondary'} size="sm" onClick={() => setOutcome('')}>All events</Button>
        <Button variant={outcome === 'denied' ? 'primary' : 'secondary'} size="sm" onClick={() => setOutcome('denied')}>Denied actions</Button>
      </div>
      <QueryView query={q} skeleton={<LoadingBlock rows={5} />}>
        {(rows) => <DataTable caption="Audit events" columns={cols} rows={rows} rowKey={(a) => a.id} initialSort={{ key: 'at', dir: 'desc' }} pageSize={15} />}
      </QueryView>
    </div>
  );
}

export default function AdminPage() {
  const session = useSession();
  const [tab, setTab] = useState('users');
  const [reset, setReset] = useState(false);
  const doReset = useAction<void, void>((s) => s.admin.resetDemo(), {
    success: 'Demo data reset to the original synthetic seed.',
    onSuccess: () => { setReset(false); setSessionUserId(DEMO_USER_FOR_ROLE.platform_admin); },
  });
  return (
    <>
      <PageHeader
        title="Administration"
        description="Users, configuration and the audit trail. Administrators manage the platform; they cannot approve qualification."
        actions={
          session.can('admin.manage') ? (
            <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" aria-hidden />} onClick={() => setReset(true)}>Reset demo data</Button>
          ) : undefined
        }
      />
      <Notice tone="info" className="mb-6">
        Users and roles here are synthetic. In a deployment, identity and role assignment come from your identity provider.
      </Notice>
      <Tabs
        label="Administration sections"
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'users', label: 'Users and roles', content: <UsersTab /> },
          { value: 'config', label: 'Configuration', content: <ConfigTab /> },
          { value: 'audit', label: 'Audit trail', content: <AuditTab /> },
        ]}
      />
      <ReasonDialog
        open={reset}
        onOpenChange={setReset}
        title="Reset demo data"
        summary="This discards every change made in this browser and restores the original synthetic dataset."
        requireReason={false}
        confirmLabel="Reset"
        variant="danger"
        loading={doReset.isPending}
        onConfirm={() => doReset.mutate()}
      />
    </>
  );
}
