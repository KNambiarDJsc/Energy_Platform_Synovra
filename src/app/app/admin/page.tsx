'use client';
import { Pencil, RotateCcw, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Overlay';
import { Notice, PageHeader, Section } from '@/components/ui/Layout';
import { ReasonDialog } from '@/components/ui/ReasonDialog';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Tabs';
import { ROLE_LABELS, ROLE_SUMMARIES, ValidationError } from '@/domain/permissions';
import type { AuditEvent, Role, Site, Tenant, User } from '@/domain/types';
import { formatDateTime } from '@/lib/format';
import { errorMessage, useAction, useRuntime, useSession, useSvcQuery } from '@/lib/hooks';
import { DEMO_USER_FOR_ROLE, setSessionUserId } from '@/services/session';

const ROLES = Object.keys(ROLE_LABELS) as Role[];

interface UserForm { name: string; title: string; email: string; role: Role; tenantId: string; allSites: boolean; sites: string[] }

function formFor(user: User | null, tenants: Tenant[]): UserForm {
  if (user) {
    return {
      name: user.name, title: user.title, email: user.email, role: user.role, tenantId: user.tenantId,
      allSites: user.siteScope === 'all', sites: user.siteScope === 'all' ? [] : user.siteScope,
    };
  }
  return { name: '', title: '', email: '', role: 'lab_operator', tenantId: tenants.find((t) => t.kind === 'operator')?.id ?? '', allSites: true, sites: [] };
}

function UserDialog({ user, tenants, sites, onClose }: { user: User | null; tenants: Tenant[]; sites: Site[]; onClose: () => void }) {
  const [f, setF] = useState<UserForm>(() => formFor(user, tenants));
  const set = (patch: Partial<UserForm>) => setF((x) => ({ ...x, ...patch }));
  const save = useAction<UserForm, User>(
    (s, v) => {
      const siteScope = v.allSites ? ('all' as const) : v.sites;
      return user
        ? s.admin.updateUser(user.id, { name: v.name, title: v.title, role: v.role, siteScope })
        : s.admin.createUser({ name: v.name, title: v.title, email: v.email, role: v.role, tenantId: v.tenantId, siteScope });
    },
    { success: (u) => (user ? `${u.name} updated.` : `${u.name} added. They sign in with ${u.email}.`), toastError: false, onSuccess: onClose },
  );
  const tenant = tenants.find((t) => t.id === f.tenantId);
  const isCustomer = tenant?.kind === 'customer';
  const tenantSites = sites.filter((s) => !isCustomer || s.tenantId === tenant?.id);
  const err = save.error;
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={user ? `Edit ${user.name}` : 'Add a user'}
      description={user ? 'Email and tenant are fixed, because sign-in through your identity provider is matched on email.' : 'The person signs in through your identity provider with this email address.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate(f)}>{user ? 'Save changes' : 'Add user'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {err && (
          <Notice tone="danger" title="Not saved">
            {errorMessage(err)}
            {err instanceof ValidationError && err.issues.length > 0 && (
              <ul className="mt-1 list-disc pl-5">{err.issues.map((i) => <li key={i}>{i}</li>)}</ul>
            )}
          </Notice>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Full name" required><Input value={f.name} onChange={(e) => set({ name: e.target.value })} autoComplete="off" /></Field>
          <Field label="Job title" required><Input value={f.title} onChange={(e) => set({ title: e.target.value })} autoComplete="off" /></Field>
        </div>
        <Field label="Email" required hint={user ? 'Cannot be changed.' : undefined}>
          <Input type="email" value={f.email} disabled={!!user} onChange={(e) => set({ email: e.target.value })} autoComplete="off" />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Tenant" required hint={user ? 'Cannot be changed.' : 'Customer accounts belong to a customer tenant.'}>
            <Select
              value={f.tenantId}
              disabled={!!user}
              onChange={(e) => {
                const customer = tenants.find((x) => x.id === e.target.value)?.kind === 'customer';
                set({ tenantId: e.target.value, sites: [], role: customer ? 'customer_auditor' : f.role === 'customer_auditor' ? 'lab_operator' : f.role });
              }}
            >
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Role" required hint={ROLE_SUMMARIES[f.role]}>
            <Select value={f.role} onChange={(e) => set({ role: e.target.value as Role })}>
              {ROLES.filter((r) => isCustomer === (r === 'customer_auditor')).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          </Field>
        </div>
        <fieldset>
          <legend className="label">Site scope</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="scope" className="h-4 w-4" checked={f.allSites} onChange={() => set({ allSites: true })} />
            {isCustomer ? `All sites of ${tenant?.name}` : 'All sites'}
          </label>
          <label className="mt-1 flex items-center gap-2 text-sm">
            <input type="radio" name="scope" className="h-4 w-4" checked={!f.allSites} onChange={() => set({ allSites: false })} />
            Selected sites only
          </label>
          {!f.allSites && (
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border border-line p-2 text-sm">
              {tenantSites.length === 0 && <li className="text-muted">No sites are set up for this tenant.</li>}
              {tenantSites.map((s) => (
                <li key={s.id}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={f.sites.includes(s.id)}
                      onChange={(e) => set({ sites: e.target.checked ? [...f.sites, s.id] : f.sites.filter((x) => x !== s.id) })}
                    />
                    {s.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      </div>
    </Modal>
  );
}

function UsersTab() {
  const session = useSession();
  const q = useSvcQuery(['admin', 'users'], (s) => s.admin.users());
  const tenants = useSvcQuery(['admin', 'tenants'], (s) => s.admin.tenants());
  const sites = useSvcQuery(['admin', 'sites'], (s) => s.admin.sites());
  const [editing, setEditing] = useState<{ user: User | null } | null>(null);
  const toggle = useAction<{ id: string; active: boolean }, unknown>((s, a) => s.admin.setUserActive(a.id, a.active), { success: 'User updated.' });
  const manage = session.can('admin.manage');
  const cols: Column<User>[] = [
    { key: 'name', header: 'Name', mobile: 'title', sort: (u) => u.name, cell: (u) => <span>{u.name}<span className="block text-xs text-muted">{u.title} · {u.email}</span></span> },
    { key: 'role', header: 'Role', sort: (u) => u.role, cell: (u) => ROLE_LABELS[u.role] },
    { key: 'tenant', header: 'Tenant', cell: (u) => tenants.data?.find((t) => t.id === u.tenantId)?.name ?? u.tenantId },
    { key: 'scope', header: 'Site scope', cell: (u) => (u.siteScope === 'all' ? 'All sites in tenant' : `${u.siteScope.length} site(s)`) },
    { key: 'active', header: 'Status', cell: (u) => <Badge tone={u.active ? 'green' : 'neutral'}>{u.active ? 'Active' : 'Inactive'}</Badge> },
    {
      key: 'act', header: 'Action', mobile: 'show',
      cell: (u) =>
        manage ? (
          <span className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" aria-hidden />} aria-label={`Edit ${u.name}`} onClick={() => setEditing({ user: u })}>
              Edit
            </Button>
            {u.id !== session.user?.id && (
              <Button size="sm" variant="secondary" onClick={() => toggle.mutate({ id: u.id, active: !u.active })}>{u.active ? 'Deactivate' : 'Activate'}</Button>
            )}
          </span>
        ) : null,
    },
  ];
  return (
    <div className="space-y-4">
      {manage && (
        <div className="flex justify-end">
          <Button icon={<UserPlus className="h-4 w-4" aria-hidden />} onClick={() => setEditing({ user: null })}>Add user</Button>
        </div>
      )}
      <QueryView query={q} skeleton={<LoadingBlock rows={4} />}>
        {(rows) => <DataTable caption="Users" columns={cols} rows={rows} rowKey={(u) => u.id} pageSize={12} />}
      </QueryView>
      {/* Mounted per open, so the form always starts from the chosen user. */}
      {manage && editing && tenants.data && sites.data && (
        <UserDialog user={editing.user} tenants={tenants.data} sites={sites.data} onClose={() => setEditing(null)} />
      )}
    </div>
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
  const runtime = useRuntime();
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
        {runtime.dataMode === 'pilot'
          ? 'People sign in through your identity provider and are matched to their platform account by email. Roles and site scope are managed here.'
          : 'Users and roles here are synthetic. In a deployment, people sign in through your identity provider and are matched to these accounts by email.'}
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
