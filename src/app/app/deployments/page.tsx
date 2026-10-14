'use client';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { Badge, LifecycleBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { Notice, PageHeader, Section } from '@/components/ui/Layout';
import { Modal } from '@/components/ui/Overlay';
import { ReasonDialog } from '@/components/ui/ReasonDialog';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { cn } from '@/lib/format';
import { errorMessage, useAction, useSession, useSvcQuery } from '@/lib/hooks';
import type { SiteView, SlotView } from '@/services/types';

function CheckIcon({ status }: { status: 'pass' | 'warn' | 'fail' }) {
  if (status === 'pass') return <CheckCircle2 className="h-4 w-4 text-approved-700" aria-hidden />;
  if (status === 'warn') return <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden />;
  return <XCircle className="h-4 w-4 text-critical-700" aria-hidden />;
}

function Allocate({ sites, preselectSlot }: { sites: SiteView[]; preselectSlot: string }) {
  const [batteryId, setBatteryId] = useState('');
  const [slotId, setSlotId] = useState('');
  const [confirm, setConfirm] = useState(false);
  const effectiveSlot = preselectSlot || slotId;
  const deployable = useSvcQuery(['deployable'], (s) => s.deployments.deployable());
  const validation = useSvcQuery(['validate', batteryId, effectiveSlot], (s) => s.deployments.validate(batteryId, effectiveSlot), {
    enabled: !!batteryId && !!effectiveSlot,
  });
  const reserve = useAction<string, unknown>((s, reason) => s.deployments.reserve(batteryId, reason), {
    success: 'Battery reserved.', toastError: false, onSuccess: () => setConfirm(false),
  });
  const move = useAction<string, unknown>((s, reason) => s.deployments.move({ batteryId, slotId: effectiveSlot, reason }), {
    success: 'Battery deployed. The assignment is recorded on its passport.',
    toastError: false,
    onSuccess: () => { setConfirm(false); setBatteryId(''); setSlotId(''); },
  });

  const emptySlots = useMemo(
    () => sites.flatMap((s) => s.strings.flatMap((st) => st.slots.filter((x) => !x.battery).map((x) => ({ id: x.slot.id, label: `${s.site.name} · ${st.string.name} · position ${x.slot.position}` })))),
    [sites],
  );
  const v = validation.data;
  const failed = v?.checks.some((c) => c.status === 'fail');

  return (
    <Section title="Allocate a battery to a slot" description="The platform checks compatibility and overlaps. A person still confirms with a reason.">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Battery (qualified or reserved)">
          <Select value={batteryId} onChange={(e) => setBatteryId(e.target.value)}>
            <option value="">Select a battery</option>
            {deployable.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label} · {b.model} · {b.lastApprovedTest?.pctOfRated != null ? `${Math.round(b.lastApprovedTest.pctOfRated)}% of rated` : 'no approved test'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Empty slot" hint="Or choose an empty slot in the site view below.">
          <Select value={effectiveSlot} onChange={(e) => setSlotId(e.target.value)}>
            <option value="">Select a slot</option>
            {emptySlots.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      {batteryId && effectiveSlot && (
        <div className="mt-5" aria-live="polite">
          <h3 className="text-sm font-semibold text-navy">Compatibility checks</h3>
          {validation.isLoading && <p className="mt-2 text-sm text-muted">Checking…</p>}
          {validation.isError && <p role="alert" className="mt-2 text-sm text-critical-700">{errorMessage(validation.error)}</p>}
          {v && (
            <ul className="mt-2 divide-y divide-line rounded-md border border-line">
              {v.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                  <CheckIcon status={c.status} />
                  <div>
                    <p className="font-medium text-ink">
                      {c.label} <span className="font-normal text-muted">· {c.status === 'pass' ? 'Passed' : c.status === 'warn' ? 'Warning' : 'Blocked'}</span>
                    </p>
                    <p className="text-muted">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button disabled={!v || failed} onClick={() => setConfirm(true)}>Deploy to slot</Button>
        <Button variant="secondary" disabled={!batteryId} onClick={() => reserve.mutate('Reserved for planned deployment')} loading={reserve.isPending}>
          Reserve battery
        </Button>
      </div>
      {reserve.error && <p role="alert" className="mt-3 text-sm font-medium text-critical-700">{errorMessage(reserve.error)}</p>}

      <ReasonDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Confirm deployment"
        summary={v?.checks.some((c) => c.status === 'warn') ? 'There are warnings above. Confirming records that you reviewed them.' : 'This opens a new assignment and closes nothing else.'}
        confirmLabel="Deploy"
        loading={move.isPending}
        error={move.error ? errorMessage(move.error) : null}
        onConfirm={(reason) => move.mutate(reason)}
      />
    </Section>
  );
}

function SlotCell({ s, onPick }: { s: SlotView; onPick: (s: SlotView) => void }) {
  const occupied = !!s.battery;
  return (
    <button
      type="button"
      onClick={() => onPick(s)}
      className={cn(
        'min-h-[64px] rounded-md border p-2 text-left text-xs transition-colors',
        occupied ? 'border-navy bg-navy text-white hover:bg-navy-800' : 'border-dashed border-[#9FB2BD] bg-white text-muted hover:border-teal hover:text-ink',
      )}
      aria-label={occupied ? `Position ${s.slot.position}: ${s.battery!.label}. Open details.` : `Position ${s.slot.position}: empty. Select for allocation.`}
    >
      <span className="block text-[11px]">Pos {s.slot.position}</span>
      <span className="mt-0.5 block text-sm font-semibold">{occupied ? s.battery!.label : 'Empty'}</span>
    </button>
  );
}

export default function DeploymentsPage() {
  const session = useSession();
  const sites = useSvcQuery(['sites'], (s) => s.deployments.sites());
  const [siteId, setSiteId] = useState<string>('');
  const [picked, setPicked] = useState<SlotView | null>(null);
  const [preselect, setPreselect] = useState('');
  const [returning, setReturning] = useState(false);
  const allocRef = useRef<HTMLDivElement>(null);

  const ret = useAction<string, unknown>((s, reason) => s.deployments.returnFromSite(picked!.battery!.id, reason), {
    success: 'Battery returned from site and its assignment closed.', toastError: false,
    onSuccess: () => { setReturning(false); setPicked(null); },
  });

  return (
    <>
      <PageHeader title="Deployments" description="Sites, strings and slot assignments. A slot holds one battery at a time, and a battery sits in one slot at a time." />
      <QueryView query={sites} skeleton={<LoadingBlock rows={5} />}>
        {(list) => {
          const site = list.find((s) => s.site.id === siteId) ?? list[0];
          return (
            <div className="space-y-6">
              {session.can('deployment.write') && (
                <div ref={allocRef}>
                  <Allocate sites={list} preselectSlot={preselect} />
                </div>
              )}

              <div className="flex flex-wrap gap-2" role="group" aria-label="Site">
                {list.map((s) => {
                  const active = s.site.id === site.site.id;
                  return (
                    <button
                      key={s.site.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => { setSiteId(s.site.id); setPreselect(''); }}
                      className={cn('min-h-[44px] whitespace-nowrap rounded-md border px-4 text-sm font-medium', active ? 'border-navy bg-navy text-white' : 'border-[#9FB2BD] bg-white hover:bg-canvas')}
                    >
                      {s.site.name}
                    </button>
                  );
                })}
              </div>

              <Section
                title={site.site.name}
                description={`${site.site.city} · ${site.site.kind} · ${site.occupied} of ${site.capacity} slots occupied`}
                actions={
                  <Badge tone={site.gatewayStatus === 'online' ? 'green' : site.gatewayStatus ? 'amber' : 'neutral'}>
                    Gateway: {site.gatewayStatus ?? 'not installed'}
                  </Badge>
                }
              >
                {site.strings.length === 0 ? (
                  <p className="text-sm text-muted">No strings are configured at this site.</p>
                ) : (
                  <div className="space-y-6">
                    {site.strings.map((st) => (
                      <div key={st.string.id}>
                        <h3 className="text-sm font-semibold text-navy">
                          {st.bank.name} / {st.string.name}{' '}
                          <span className="font-normal text-muted">· {st.familyModel} · {st.string.nominalVoltageV} V nominal</span>
                        </h3>
                        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                          {st.slots.map((sl) => (
                            <SlotCell
                              key={sl.slot.id}
                              s={sl}
                              onPick={(s) => {
                                if (s.battery) setPicked(s);
                                else if (session.can('deployment.write')) {
                                  setPreselect(s.slot.id);
                                  allocRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
              {!session.can('deployment.write') && (
                <Notice tone="info">Your role can view deployments but not change them.</Notice>
              )}
            </div>
          );
        }}
      </QueryView>

      {picked?.battery && (
        <ReasonDialog
          open={returning}
          onOpenChange={(o) => !o && setReturning(false)}
          title={`Return ${picked.battery.label} from site`}
          summary="Closes the current assignment and sets the battery to Returned for disposition."
          confirmLabel="Return from site"
          loading={ret.isPending}
          error={ret.error ? errorMessage(ret.error) : null}
          onConfirm={(r) => ret.mutate(r)}
        />
      )}
      <Modal
        open={!!picked?.battery && !returning}
        onOpenChange={(o) => !o && setPicked(null)}
        title={picked?.battery?.label ?? 'Slot'}
        description={picked ? `Position ${picked.slot.position}` : undefined}
        size="sm"
      >
        {picked?.battery && (
          <div>
            <LifecycleBadge state={picked.battery.state} />
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={`/app/batteries/${picked.battery.id}`} className="inline-flex min-h-[44px] items-center rounded-md bg-teal px-4 text-sm font-medium text-white hover:bg-teal-700">
                Open passport
              </Link>
              {session.can('deployment.write') && (
                <Button variant="secondary" onClick={() => setReturning(true)}>Return from site</Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
