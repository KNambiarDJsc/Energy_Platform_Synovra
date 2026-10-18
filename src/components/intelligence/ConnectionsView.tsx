'use client';
import { BookText, CircleX, Database, Filter, Link2, Link2Off, Lock, Pause, Play, Radio, Server, TriangleAlert, Waypoints } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { chipClass } from '@/components/ui/buttonClass';
import { Field, Input, Select } from '@/components/ui/Field';
import { Section } from '@/components/ui/Layout';
import { cn, formatNumber } from '@/lib/format';
import { useSvcQuery } from '@/lib/hooks';
import type { BatteryListItem } from '@/services/types';

/* ------------------------------ simulator ------------------------------ */

/** The simulator's own register map. It describes our test device only; no manufacturer's map is reproduced or guessed. */
const SIM_MAP = [
  { address: '40001', name: 'Voltage', type: 'uint16', scale: '× 0.01', unit: 'V' },
  { address: '40002', name: 'Temperature', type: 'int16', scale: '× 0.1', unit: '°C' },
  { address: '40003', name: 'Channel', type: 'uint16', scale: '× 1', unit: '' },
];

interface Frame {
  seq: number;
  at: string;
  channel: 1 | 2;
  raw: [number, number];
  volts: number;
  tempC: number;
  battery: string | null;
  outcome: 'accepted' | 'quarantined' | 'device_only';
  note: string;
}

const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(4, '0')}`;

function rangeFor(b: BatteryListItem | undefined): [number, number] {
  return b?.unitType === '2V cell' ? [1.75, 2.6] : [10.5, 15.0];
}

function Simulator() {
  const deployed = useSvcQuery(['batteries', 'deployed-for-sim'], (s) => s.batteries.list({ state: 'deployed' }));
  const options = deployed.data ?? [];
  const [running, setRunning] = useState(false);
  const [map1, setMap1] = useState('');
  const [map2, setMap2] = useState('');
  const [frames, setFrames] = useState<Frame[]>([]);
  const fault = useRef(false);
  const seq = useRef(0);
  const live = useRef<HTMLParagraphElement>(null);

  const channel1 = map1 || options[0]?.id || '';
  const byId = (id: string) => options.find((o) => o.id === id);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      seq.current += 1;
      const channel: 1 | 2 = seq.current % 3 === 0 ? 2 : 1;
      const mapped = byId(channel === 1 ? channel1 : map2);
      const nominal = mapped?.unitType === '2V cell' ? 2.25 : 13.5;
      let volts = Math.round((nominal + (Math.random() - 0.5) * nominal * 0.02) * 100) / 100;
      const tempC = Math.round((25 + Math.random() * 3) * 10) / 10;
      let rawV = Math.round(volts * 100);
      if (fault.current && channel === 1) {
        rawV = 0xffff;
        volts = rawV / 100;
        fault.current = false;
      }
      const raw: [number, number] = [rawV, Math.round(tempC * 10)];
      const [lo, hi] = rangeFor(mapped);
      let outcome: Frame['outcome'];
      let note: string;
      if (!mapped) {
        outcome = 'device_only';
        note = `No battery is mapped to channel ${channel}. Kept as a device reading; not attached to any battery.`;
      } else if (volts < lo || volts > hi) {
        outcome = 'quarantined';
        note = `${formatNumber(volts, 2)} V is outside ${lo}–${hi} V for a ${mapped.unitType}. Quarantined with its raw registers for a person to check.`;
      } else {
        outcome = 'accepted';
        note = `Attached to ${mapped.label} through the channel mapping.`;
      }
      const f: Frame = { seq: seq.current, at: new Date().toLocaleTimeString('en-GB'), channel, raw, volts, tempC, battery: mapped?.label ?? null, outcome, note };
      setFrames((xs) => [f, ...xs].slice(0, 8));
      if (live.current && outcome !== 'accepted') live.current.textContent = note;
    };
    tick();
    const t = window.setInterval(tick, 1600);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when the run state or mapping changes
  }, [running, channel1, map2, options.length]);

  const OUTCOME = {
    accepted: <Badge tone="green" icon={Link2}>Attached</Badge>,
    quarantined: <Badge tone="amber" icon={TriangleAlert}>Quarantined</Badge>,
    device_only: <Badge tone="neutral" icon={Link2Off}>Device only</Badge>,
  } as const;

  return (
    <Section
      title="Simulator"
      description="A pretend device that runs in your browser to exercise the connector design. Its readings are invented and are not stored."
      actions={<Badge tone="amber">Simulated</Badge>}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-ink">Simulator register map</p>
            <p className="text-[13px] text-muted">Ours, for the simulator only.</p>
            <table className="mt-2 w-full text-left text-[13px]">
              <caption className="sr-only">Simulator register map</caption>
              <thead><tr className="text-muted"><th scope="col" className="py-1 pr-2 font-medium">Register</th><th scope="col" className="py-1 pr-2 font-medium">Value</th><th scope="col" className="py-1 pr-2 font-medium">Type</th><th scope="col" className="py-1 font-medium">Scale</th></tr></thead>
              <tbody>
                {SIM_MAP.map((r) => (
                  <tr key={r.address} className="border-t border-line">
                    <td className="mono py-1.5 pr-2">{r.address}</td><td className="py-1.5 pr-2">{r.name}</td><td className="py-1.5 pr-2 text-ink-2">{r.type}</td><td className="py-1.5 text-ink-2">{r.scale} {r.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Field label="Channel 1 is connected to" hint="A dated mapping is what lets a reading belong to one battery.">
            <Select value={channel1} onChange={(e) => setMap1(e.target.value)}>
              <option value="">Nothing mapped</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label} · {o.unitType}</option>)}
            </Select>
          </Field>
          <Field label="Channel 2 is connected to" hint="Leave unmapped to see a reading that belongs to no battery.">
            <Select value={map2} onChange={(e) => setMap2(e.target.value)}>
              <option value="">Nothing mapped</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label} · {o.unitType}</option>)}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button icon={running ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} onClick={() => setRunning((r) => !r)}>
              {running ? 'Pause simulator' : 'Start simulator'}
            </Button>
            <Button variant="secondary" disabled={!running} onClick={() => { fault.current = true; }}>Send a bad reading</Button>
          </div>
          <p ref={live} className="sr-only" aria-live="polite" />
        </div>
        <div className="min-w-0">
          {frames.length === 0 ? (
            <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl bg-canvas p-6 text-center text-sm text-muted">
              Start the simulator to see each reading travel from raw registers to a battery record.
            </div>
          ) : (
            <ol className="space-y-2">
              {frames.map((f) => (
                <li key={f.seq} className="anim-row rounded-xl bg-canvas p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] text-muted">{f.at} · channel {f.channel}</span>
                    {OUTCOME[f.outcome]}
                  </div>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink">
                    <span className="mono rounded bg-white px-1.5 text-[13px]">{hex(f.raw[0])}</span>
                    <span className="text-muted">→</span>
                    <span>{formatNumber(f.volts, 2)} V</span>
                    <span className="mono rounded bg-white px-1.5 text-[13px]">{hex(f.raw[1])}</span>
                    <span className="text-muted">→</span>
                    <span>{formatNumber(f.tempC, 1)} °C</span>
                  </p>
                  <p className="mt-1 text-[13px] text-ink-2">{f.note}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------ the connection itself ------------------------------ */

const NEEDS = [
  ['Authorised access', 'Written permission to read the box, from its owner and manufacturer.'],
  ['Connection settings', 'For RTU: port, baud rate, parity, stop bits and unit ID. For TCP: address, port and unit ID.'],
  ['The manufacturer’s register map', 'Which register holds which value, its type, scaling and unit. Not provided, so nothing is decoded.'],
  ['Battery-to-channel mapping', 'Which battery each channel measures, from when. A charger channel may serve a whole string.'],
];

const PIPELINE = [
  { icon: Radio, title: 'Device', text: 'Charger, tester or monitor.' },
  { icon: Server, title: 'Site gateway', text: 'Polls read-only, timestamps and buffers through network gaps.' },
  { icon: Filter, title: 'Check and normalise', text: 'Units, ranges and freshness. Bad readings go to quarantine.' },
  { icon: Waypoints, title: 'Link to a battery', text: 'Through the dated channel mapping, or kept as device-level.' },
  { icon: Database, title: 'Battery history', text: 'Rules, reports and, later, reviewed models read from here.' },
];

export function ConnectionsView() {
  const [transport, setTransport] = useState<'rtu' | 'tcp'>('rtu');
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5 md:p-6">
          <Radio className="h-5 w-5 text-copper" strokeWidth={1.7} aria-hidden />
          <h2 className="mt-3 font-display text-[24px] leading-8 text-ink">Modbus is the language</h2>
          <p className="mt-1.5 text-sm leading-[22px] text-ink-2">A request-and-reply protocol over RS-485 serial (RTU) or a network (TCP). It says how to ask a device for register 40001. It does not say what register 40001 means.</p>
        </div>
        <div className="card p-5 md:p-6">
          <BookText className="h-5 w-5 text-copper" strokeWidth={1.7} aria-hidden />
          <h2 className="mt-3 font-display text-[24px] leading-8 text-ink">The register map is the dictionary</h2>
          <p className="mt-1.5 text-sm leading-[22px] text-ink-2">Only the manufacturer’s map turns 0x053A into “block voltage, 13.38 V”. Without it the platform does not guess: a guessed scale or unit would put wrong numbers into battery histories.</p>
        </div>
      </div>

      <Section
        title="Communication box"
        description="The existing box at the workshop. Shown as a design, not a live connection."
        actions={<Badge tone="neutral" icon={CircleX}>Not connected</Badge>}
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-ink">Needed before it can be switched on</p>
            <ul className="mt-3 space-y-3">
              {NEEDS.map(([t, d]) => (
                <li key={t} className="flex items-start gap-3">
                  <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-critical-700" aria-label="Missing" />
                  <span><span className="block text-sm font-medium text-ink">{t}</span><span className="text-[13px] text-muted">{d}</span></span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">Connector settings</p>
              <span className="inline-flex items-center gap-1.5 text-[13px] text-muted"><Lock className="h-3.5 w-3.5" aria-hidden />Read-only by design: no write function codes</span>
            </div>
            <div className="mt-3 flex gap-2" role="group" aria-label="Transport">
              <button type="button" aria-pressed={transport === 'rtu'} onClick={() => setTransport('rtu')} className={chipClass(transport === 'rtu')}>RTU over RS-485</button>
              <button type="button" aria-pressed={transport === 'tcp'} onClick={() => setTransport('tcp')} className={chipClass(transport === 'tcp')}>TCP</button>
            </div>
            <fieldset disabled className="mt-4 grid grid-cols-2 gap-3">
              <legend className="sr-only">Connector settings, not editable until the requirements are met</legend>
              {transport === 'rtu' ? (
                <>
                  <Field label="Serial port"><Input placeholder="Not provided" /></Field>
                  <Field label="Baud rate"><Input placeholder="Not provided" /></Field>
                  <Field label="Parity and stop bits"><Input placeholder="Not provided" /></Field>
                  <Field label="Unit ID"><Input placeholder="Not provided" /></Field>
                </>
              ) : (
                <>
                  <Field label="Address"><Input placeholder="Not provided" /></Field>
                  <Field label="Port"><Input placeholder="Not provided" /></Field>
                  <Field label="Unit ID"><Input placeholder="Not provided" /></Field>
                  <Field label="Poll interval"><Input placeholder="Not set" /></Field>
                </>
              )}
            </fieldset>
            <p className="mt-3 text-[13px] text-muted">Register map: none on file. The table stays empty until the manufacturer provides one; values are never inferred.</p>
          </div>
        </div>
      </Section>

      <section aria-labelledby="path-h">
        <h2 id="path-h" className="font-display text-[26px] leading-8 text-ink">The path every reading takes</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PIPELINE.map((s, i) => (
            <li key={s.title} className={cn('rounded-xl bg-white p-4', i === 3 && 'bg-copper-50')}>
              <s.icon className="h-5 w-5 text-copper" strokeWidth={1.7} aria-hidden />
              <p className="mt-2 text-sm font-medium text-ink"><span className="num text-muted">{i + 1}. </span>{s.title}</p>
              <p className="mt-0.5 text-[13px] leading-5 text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <Simulator />
    </div>
  );
}
