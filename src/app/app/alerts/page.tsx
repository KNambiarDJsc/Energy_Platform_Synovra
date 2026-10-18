'use client';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AlertStateBadge, Badge, SeverityBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, DateTimeCell, type Column } from '@/components/ui/DataTable';
import { chipClass } from '@/components/ui/buttonClass';
import { Field, Input, Select, Textarea, ToolbarSelect } from '@/components/ui/Field';
import { KeyValue, Notice, PageHeader, TableCard } from '@/components/ui/Layout';
import { Drawer, Modal } from '@/components/ui/Overlay';
import { ReasonDialog } from '@/components/ui/ReasonDialog';
import { EmptyState, LoadingBlock, QueryView } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Tabs';
import type { AlertState, Severity } from '@/domain/types';
import { formatDate, formatDateTime, titleCase } from '@/lib/format';
import { errorMessage, useAction, useSession, useSvcQuery } from '@/lib/hooks';
import type { AlertView, TaskView } from '@/services/types';

const TYPE_LABEL: Record<string, string> = {
  gateway_offline: 'Gateway offline', sensor_unmapped: 'Sensor unmapped', missing_telemetry: 'Missing telemetry',
  voltage_threshold: 'Voltage threshold', temperature_threshold: 'Temperature threshold', resistance_trend: 'Resistance trend',
  suspected_battery_issue: 'Suspected battery issue', warranty_review: 'Warranty review',
};

/* ------------------------------ task modal ------------------------------ */

function TaskModal({ open, onOpenChange, alert }: { open: boolean; onOpenChange: (o: boolean) => void; alert?: AlertView | null }) {
  const sites = useSvcQuery(['facets-sites'], async (s) => (await s.batteries.facets()).sites, { enabled: open });
  const assignees = useSvcQuery(['assignees'], (s) => s.alerts.assignees(), { enabled: open });
  const [f, setF] = useState({ title: alert ? `Follow up: ${alert.title}` : '', description: alert?.recommendedAction ?? '', siteId: alert?.siteId ?? '', priority: 'normal', assigneeId: '', dueOn: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const create = useAction<void, unknown>(
    (s) =>
      s.alerts.createTask({
        title: f.title, description: f.description, siteId: f.siteId, priority: f.priority as 'low' | 'normal' | 'high',
        assigneeId: f.assigneeId || null, dueOn: f.dueOn || null, alertId: alert?.id ?? null, batteryId: alert?.batteryId ?? null,
      }),
    { success: 'Service task created.', onSuccess: () => onOpenChange(false), toastError: false },
  );
  function submit() {
    const e: Record<string, string> = {};
    if (f.title.trim().length < 5) e.title = 'Give the task a title of at least 5 characters.';
    if (!f.siteId) e.siteId = 'Select the site.';
    setErr(e);
    if (!Object.keys(e).length) create.mutate();
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Create service task"
      description={alert ? `From alert ${alert.id}` : 'A task assigns work to a person. It does not act on equipment.'}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={create.isPending} onClick={submit}>Create task</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" required error={err.title}><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={140} /></Field>
        <Field label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Site" required error={err.siteId}>
            <Select value={f.siteId} onChange={(e) => setF({ ...f, siteId: e.target.value })}>
              <option value="">Select a site</option>
              {sites.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
              <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
            </Select>
          </Field>
          <Field label="Assignee">
            <Select value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })}>
              <option value="">Unassigned</option>
              {assignees.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Due date"><Input type="date" value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} /></Field>
        </div>
        {create.error && <p role="alert" className="text-sm font-medium text-critical-700">{errorMessage(create.error)}</p>}
      </div>
    </Modal>
  );
}

/* ------------------------------ alert drawer ------------------------------ */

type AlertDialog = 'resolve' | 'close' | 'task' | null;

function AlertDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const session = useSession();
  const q = useSvcQuery(['alert', id], (s) => s.alerts.get(id!), { enabled: !!id });
  const assignees = useSvcQuery(['assignees'], (s) => s.alerts.assignees(), { enabled: !!id && session.can('alert.assign') });
  const [assignee, setAssignee] = useState('');
  const [dialog, setDialog] = useState<AlertDialog>(null);
  const ack = useAction<string, unknown>((s, aid) => s.alerts.acknowledge(aid), { success: 'Alert acknowledged.' });
  const start = useAction<string, unknown>((s, aid) => s.alerts.start(aid), { success: 'Work started.' });
  const assign = useAction<string, unknown>((s, who) => s.alerts.assign(id!, who), { success: 'Alert assigned.' });
  const resolve = useAction<string, unknown>((s, r) => s.alerts.resolve(id!, r), { success: 'Alert resolved.', toastError: false, onSuccess: () => setDialog(null) });
  const close = useAction<void, unknown>((s) => s.alerts.close(id!), { success: 'Alert closed.', onSuccess: () => setDialog(null) });

  const a = q.data;
  const canAct = session.can('alert.act');
  return (
    <>
      <Drawer open={!!id} onOpenChange={(o) => !o && onClose()} title={a ? a.title : 'Alert'} description={a ? `${a.id} · ${TYPE_LABEL[a.type] ?? a.type}` : undefined}>
        {q.isLoading && <LoadingBlock rows={4} />}
        {q.isError && <p role="alert" className="text-sm text-critical-700">{errorMessage(q.error)}</p>}
        {a && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={a.severity} /> <AlertStateBadge state={a.state} />
              <Badge tone={a.source.kind === 'model' ? 'amber' : 'teal'}>{a.source.kind === 'model' ? 'Model-generated' : a.source.kind === 'rule' ? 'Rule-generated' : 'System'}</Badge>
            </div>
            <p className="text-sm text-ink">{a.detail}</p>
            <Notice tone="info" title="Suggested next step">{a.recommendedAction}</Notice>
            <KeyValue
              columns={2}
              items={[
                { label: 'Site', value: a.siteName },
                { label: 'Battery', value: a.batteryId ? <Link href={`/app/batteries/${a.batteryId}`} className="mono text-copper-700 underline underline-offset-2">{a.batteryLabel}</Link> : 'Not battery-specific' },
                { label: 'Raised by', value: `${a.source.name} ${a.source.version}` },
                { label: 'Last evaluated', value: formatDateTime(a.lastEvaluatedAt), hint: a.freshness.label },
                { label: 'Assignee', value: a.assigneeName ?? 'Unassigned' },
                { label: 'Created', value: formatDateTime(a.createdAt) },
              ]}
            />
            {a.evidence.length > 0 && (
              <div>
                <p className="text-[13px] font-medium text-muted">Evidence</p>
                <dl className="mt-1 space-y-0.5 overflow-hidden rounded-lg [&>*]:bg-canvas [&>*]:px-3.5 text-sm">
                  {a.evidence.map((e) => (
                    <div key={e.label} className="flex justify-between gap-3 px-3 py-2"><dt className="text-muted">{e.label}</dt><dd className="text-right">{e.value}</dd></div>
                  ))}
                </dl>
              </div>
            )}
            {a.resolutionReason && <p className="rounded-lg bg-canvas p-3 text-sm"><span className="font-medium">Resolution:</span> {a.resolutionReason}</p>}
            {a.history.length > 0 && (
              <div>
                <p className="text-[13px] font-medium text-muted">History</p>
                <ul className="mt-1 space-y-1.5 text-sm">
                  {a.history.map((h, i) => (
                    <li key={i}><span className="text-muted">{formatDateTime(h.at)} · {h.actorName}:</span> {h.from ? `${titleCase(h.from)} → ` : ''}{titleCase(h.to)}{h.note ? ` · ${h.note}` : ''}</li>
                  ))}
                </ul>
              </div>
            )}

            {canAct && (
              <div className="space-y-3 pt-4">
                <div className="flex flex-wrap gap-2">
                  {a.state === 'open' && <Button loading={ack.isPending} onClick={() => ack.mutate(a.id)}>Acknowledge</Button>}
                  {(a.state === 'acknowledged' || a.state === 'assigned') && <Button loading={start.isPending} onClick={() => start.mutate(a.id)}>Start work</Button>}
                  {['acknowledged', 'assigned', 'in_progress'].includes(a.state) && <Button variant="secondary" onClick={() => setDialog('resolve')}>Resolve</Button>}
                  {a.state === 'resolved' && <Button variant="secondary" loading={close.isPending} onClick={() => close.mutate()}>Close</Button>}
                  {session.can('task.write') && a.state !== 'closed' && <Button variant="secondary" onClick={() => setDialog('task')}>Create task</Button>}
                </div>
                {session.can('alert.assign') && ['open', 'acknowledged'].includes(a.state) && (
                  <div className="flex flex-wrap items-end gap-2">
                    <Field label="Assign to" className="min-w-[200px] flex-1">
                      <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                        <option value="">Select a person</option>
                        {assignees.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </Select>
                    </Field>
                    <Button variant="secondary" disabled={!assignee} loading={assign.isPending} onClick={() => assign.mutate(assignee)}>Assign</Button>
                  </div>
                )}
              </div>
            )}
            {!canAct && <p className="pt-4 text-sm text-muted">Your role can read alerts but not act on them.</p>}
          </div>
        )}
      </Drawer>
      <ReasonDialog
        open={dialog === 'resolve'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Resolve alert"
        reasonLabel="What was found and done?"
        confirmLabel="Resolve"
        loading={resolve.isPending}
        error={resolve.error ? errorMessage(resolve.error) : null}
        onConfirm={(r) => resolve.mutate(r)}
      />
      {dialog === 'task' && <TaskModal open onOpenChange={(o) => !o && setDialog(null)} alert={a} />}
    </>
  );
}

/* ------------------------------ lists ------------------------------ */

function AlertsList({ onOpen }: { onOpen: (id: string) => void }) {
  const [active, setActive] = useState(true);
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [state, setState] = useState<AlertState | ''>('');
  const q = useSvcQuery(['alerts', active, severity, state], (s) => s.alerts.list({ active: active || undefined, severity, state }));
  const cols: Column<AlertView>[] = [
    { key: 'sev', header: 'Severity', mobile: 'title', sort: (a) => ({ critical: 0, warning: 1, info: 2 })[a.severity], cell: (a) => <SeverityBadge severity={a.severity} /> },
    {
      key: 'title', header: 'Alert',
      cell: (a) => (
        <span>
          <button type="button" onClick={() => onOpen(a.id)} className="text-left font-semibold text-copper-700 underline-offset-2 hover:underline">{a.title}</button>
          <span className="block text-xs text-muted">{TYPE_LABEL[a.type] ?? a.type} · {a.id}</span>
        </span>
      ),
    },
    { key: 'state', header: 'State', cell: (a) => <AlertStateBadge state={a.state} /> },
    { key: 'where', header: 'Site / battery', cell: (a) => <span>{a.siteName}{a.batteryLabel && <span className="mono block text-xs text-muted">{a.batteryLabel}</span>}</span> },
    { key: 'src', header: 'Raised by', mobile: 'hide', hideBelow: '2xl', cell: (a) => <span className="text-xs">{a.source.kind === 'model' ? 'Model' : a.source.kind === 'rule' ? 'Rule' : 'System'}: {a.source.name}</span> },
    { key: 'assignee', header: 'Assignee', cell: (a) => a.assigneeName ?? <span className="text-muted">Unassigned</span> },
    { key: 'when', header: 'Raised', sort: (a) => a.createdAt, cell: (a) => <DateTimeCell iso={a.createdAt} note={a.freshness.stale && <span className="block text-xs text-amber-700">Stale evaluation</span>} /> },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2" role="group" aria-label="Filter alerts">
        <div className="flex gap-2">
          <button type="button" aria-pressed={active} className={chipClass(active, 'min-h-[40px]')} onClick={() => setActive(true)}>
            Active
          </button>
          <button type="button" aria-pressed={!active} className={chipClass(!active, 'min-h-[40px]')} onClick={() => setActive(false)}>
            All, including closed
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
        <ToolbarSelect label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value as Severity | '')}>
          <option value="">Any severity</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option>
        </ToolbarSelect>
        <ToolbarSelect label="State" value={state} onChange={(e) => setState(e.target.value as AlertState | '')}>
          <option value="">Any state</option>
          {(['open', 'acknowledged', 'assigned', 'in_progress', 'resolved', 'closed'] as const).map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </ToolbarSelect>
        </div>
      </div>
      <QueryView query={q} skeleton={<LoadingBlock rows={5} />} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No alerts match" description="Nothing needs attention with these filters." />}>
        {(rows) => (
          <TableCard>
            <DataTable caption="Alerts" columns={cols} rows={rows} rowKey={(a) => a.id} initialSort={{ key: 'sev', dir: 'asc' }} pageSize={12} />
          </TableCard>
        )}
      </QueryView>
    </div>
  );
}

function TasksList() {
  const session = useSession();
  const [create, setCreate] = useState(false);
  const q = useSvcQuery(['tasks'], (s) => s.alerts.tasks());
  const confirm = useAction<string, unknown>((s, id) => s.alerts.confirmDraft(id), { success: 'Draft confirmed. The task is now open.' });
  const update = useAction<{ id: string; status: TaskView['status'] }, unknown>((s, a) => s.alerts.updateTask(a.id, { status: a.status }), { success: 'Task updated.' });
  const cols: Column<TaskView>[] = [
    { key: 'title', header: 'Task', mobile: 'title', cell: (t) => <span>{t.title}<span className="block text-xs text-muted">{t.id}{t.origin === 'assistant_draft' ? ' · drafted by assistant' : ''}</span></span> },
    { key: 'status', header: 'Status', cell: (t) => <Badge tone={t.status === 'done' ? 'green' : t.status === 'draft' ? 'amber' : t.status === 'cancelled' ? 'neutral' : 'teal'}>{titleCase(t.status)}</Badge> },
    { key: 'prio', header: 'Priority', cell: (t) => <Badge tone={t.priority === 'high' ? 'red' : 'neutral'}>{titleCase(t.priority)}</Badge> },
    { key: 'site', header: 'Site / battery', cell: (t) => <span>{t.siteName}{t.batteryLabel && <span className="mono block text-xs text-muted">{t.batteryLabel}</span>}</span> },
    { key: 'who', header: 'Assignee', cell: (t) => t.assigneeName ?? <span className="text-muted">Unassigned</span> },
    { key: 'due', header: 'Due', sort: (t) => t.dueOn, cell: (t) => (t.dueOn ? formatDate(t.dueOn) : <span className="text-muted">No due date</span>) },
    {
      key: 'act', header: 'Action', mobile: 'show',
      cell: (t) =>
        !session.can('task.write') ? null : t.status === 'draft' ? (
          <Button size="sm" loading={confirm.isPending} onClick={() => confirm.mutate(t.id)}>Confirm draft</Button>
        ) : t.status === 'open' ? (
          <Button size="sm" variant="secondary" onClick={() => update.mutate({ id: t.id, status: 'in_progress' })}>Start</Button>
        ) : t.status === 'in_progress' ? (
          <Button size="sm" variant="secondary" onClick={() => update.mutate({ id: t.id, status: 'done' })}>Mark done</Button>
        ) : null,
    },
  ];
  return (
    <div className="space-y-4">
      {session.can('task.write') && (
        <div><Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setCreate(true)}>Create task</Button></div>
      )}
      <QueryView query={q} skeleton={<LoadingBlock rows={4} />} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No service tasks" description="Tasks created from alerts or by the assistant (after confirmation) appear here." />}>
        {(rows) => (
          <TableCard>
            <DataTable caption="Service tasks" columns={cols} rows={rows} rowKey={(t) => t.id} initialSort={{ key: 'due', dir: 'asc' }} pageSize={12} />
          </TableCard>
        )}
      </QueryView>
      {create && <TaskModal open onOpenChange={setCreate} />}
    </div>
  );
}

function AlertsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get('alert');
  const [tab, setTab] = useState(params.get('tab') === 'tasks' ? 'tasks' : 'alerts');
  return (
    <>
      <PageHeader title="Alerts and tasks" description="Rule- and model-raised alerts with who owns them, and the service tasks that follow. Acting on an alert is always a person’s decision." />
      <Tabs
        label="Alerts or tasks"
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'alerts', label: 'Alerts', content: <AlertsList onOpen={(id) => router.replace(`/app/alerts?alert=${id}`, { scroll: false })} /> },
          { value: 'tasks', label: 'Service tasks', content: <TasksList /> },
        ]}
      />
      <AlertDrawer id={openId} onClose={() => router.replace('/app/alerts', { scroll: false })} />
    </>
  );
}

export default function AlertsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <AlertsInner />
    </Suspense>
  );
}
