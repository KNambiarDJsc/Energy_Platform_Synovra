import type { Battery, TelemetryObservation } from '@/domain/types';
import { canSeeBattery, canSeeSite, db, latency, authorize, type Ctx } from '../core';
import type { GatewayView, SensorView, SeriesPoint, TelemetryRepository, TelemetrySummary } from '../types';

const HOUR = 3_600_000;
const EXPECTED_PER_30D = 30 * 24 * 4;

const indexCache = new WeakMap<TelemetryObservation[], Map<string, TelemetryObservation[]>>();
function byBattery(ctx: Ctx): Map<string, TelemetryObservation[]> {
  const arr = ctx.store.telemetry;
  let idx = indexCache.get(arr);
  if (!idx) {
    idx = new Map();
    for (const o of arr) {
      const list = idx.get(o.batteryId);
      if (list) list.push(o);
      else idx.set(o.batteryId, [o]);
    }
    indexCache.set(arr, idx);
  }
  return idx;
}

function activeSensorFor(ctx: Ctx, b: Battery) {
  const d = db(ctx);
  const asg = d.assignments.find((a) => a.id === b.currentAssignmentId);
  if (!asg) return { reason: 'Not installed in a slot, so no sensor can be attributed to it.', sa: null, sensor: null, gw: null };
  const sa = d.sensorAssignments.find((x) => x.slotId === asg.slotId && !x.endAt);
  if (!sa) return { reason: 'No sensor is mapped to this slot. Telemetry is unknown, not normal.', sa: null, sensor: null, gw: null };
  const sensor = d.sensors.find((s) => s.id === sa.sensorId)!;
  const gw = d.gateways.find((g) => g.id === sensor.gatewayId)!;
  return { reason: '', sa, sensor, gw };
}

export function telemetrySummaryFor(ctx: Ctx, b: Battery): TelemetrySummary {
  const none: TelemetrySummary = {
    available: false, reason: '', sensorSerial: null, lastReadingAt: null, freshness: 'none', voltageV: null,
    temperatureC: null, resistanceMOhm: null, resistanceSource: null, completenessPct: null, mappingQuality: null, hoursAbove30C: null,
  };
  const { reason, sa, sensor, gw } = activeSensorFor(ctx, b);
  if (!sa || !sensor || !gw) return { ...none, reason };
  const obs = (byBattery(ctx).get(b.id) ?? []).filter((o) => o.sensorId === sensor.id);
  const measured = obs.filter((o) => o.quality === 'measured');
  if (measured.length === 0) return { ...none, reason: 'Sensor is mapped but no measured readings exist.', sensorSerial: sensor.serial, mappingQuality: sa.mappingQuality };
  const last = measured[measured.length - 1];
  const snapshot = Date.parse(ctx.store.snapshotAt);
  const ageMin = (snapshot - Date.parse(last.t)) / 60_000;
  const stale = ageMin > gw.samplingIntervalMin * 3;
  const lastRes = [...measured].reverse().find((o) => o.resistanceMOhm !== null);
  return {
    available: true,
    reason: stale ? `Last reading is ${Math.round(ageMin / 60)} h old. Values shown are stale, not current.` : 'Synthetic telemetry snapshot.',
    sensorSerial: sensor.serial, lastReadingAt: last.t, freshness: stale ? 'stale' : 'fresh',
    voltageV: last.voltageV, temperatureC: last.temperatureC, resistanceMOhm: lastRes?.resistanceMOhm ?? null,
    resistanceSource: sensor.resistanceSource,
    completenessPct: Math.round((measured.length / EXPECTED_PER_30D) * 1000) / 10,
    mappingQuality: sa.mappingQuality,
    hoursAbove30C: Math.round(measured.filter((o) => (o.temperatureC ?? 0) > 30).length * 0.25 * 10) / 10,
  };
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function createTelemetryRepository(ctx: Ctx): TelemetryRepository {
  const snapshotMs = () => Date.parse(ctx.store.snapshotAt);
  return {
    snapshotAt: () => ctx.store.snapshotAt,

    async gateways() {
      await latency(ctx);
      authorize(ctx, 'telemetry.read');
      const d = db(ctx);
      return d.gateways
        .filter((g) => canSeeSite(ctx, d.sites.find((s) => s.id === g.siteId)!))
        .map<GatewayView>((g) => {
          const ageHours = (snapshotMs() - Date.parse(g.lastSeenAt)) / HOUR;
          const sensors = d.sensors.filter((s) => s.gatewayId === g.id);
          const unmapped = sensors.filter((s) => !d.sensorAssignments.some((a) => a.sensorId === s.id && a.slotId && !a.endAt)).length;
          return {
            gateway: g, siteName: d.sites.find((s) => s.id === g.siteId)!.name,
            freshness: ageHours * 60 > g.samplingIntervalMin * 3 ? 'stale' : 'fresh',
            ageHours: Math.round(ageHours * 10) / 10, sensors: sensors.length, unmapped,
          };
        });
    },

    async sensors() {
      await latency(ctx);
      authorize(ctx, 'telemetry.read');
      const d = db(ctx);
      const idx = byBattery(ctx);
      const out: SensorView[] = [];
      for (const sensor of d.sensors) {
        const gateway = d.gateways.find((g) => g.id === sensor.gatewayId)!;
        const site = d.sites.find((s) => s.id === gateway.siteId)!;
        if (!canSeeSite(ctx, site)) continue;
        const history = d.sensorAssignments.filter((a) => a.sensorId === sensor.id).sort((x, y) => y.startAt.localeCompare(x.startAt));
        const assignment = history.find((a) => !a.endAt) ?? null;
        const slot = assignment?.slotId ? d.slots.find((s) => s.id === assignment.slotId) : null;
        const str = slot ? d.strings.find((s) => s.id === slot.stringId) : null;
        const asg = slot ? d.assignments.find((a) => a.slotId === slot.id && !a.endAt) : null;
        const battery = asg ? d.batteries.find((b) => b.id === asg.batteryId) ?? null : null;
        if (battery && !canSeeBattery(ctx, battery)) continue;
        const obs = battery ? (idx.get(battery.id) ?? []).filter((o) => o.sensorId === sensor.id) : [];
        const measured = obs.filter((o) => o.quality === 'measured');
        const last = measured[measured.length - 1];
        const ageMin = last ? (snapshotMs() - Date.parse(last.t)) / 60_000 : Infinity;
        out.push({
          sensor, gateway, assignment, history, siteName: site.name,
          slotLabel: slot && str ? `${str.name} / pos ${slot.position}` : null,
          batteryId: battery?.id ?? null, batteryLabel: battery?.label ?? null,
          lastReadingAt: last?.t ?? null,
          freshness: !last ? 'none' : ageMin > gateway.samplingIntervalMin * 3 ? 'stale' : 'fresh',
          completenessPct: battery ? Math.round((measured.length / EXPECTED_PER_30D) * 1000) / 10 : null,
        });
      }
      return out;
    },

    async series(batteryId, days) {
      await latency(ctx);
      authorize(ctx, 'telemetry.read');
      const d = db(ctx);
      const b = d.batteries.find((x) => x.id === batteryId);
      if (!b || !canSeeBattery(ctx, b)) return { points: [], bucketHours: 1, sensorSerial: null, note: 'Battery not found or outside your access.' };
      const { reason, sensor } = activeSensorFor(ctx, b);
      if (!sensor) return { points: [], bucketHours: 1, sensorSerial: null, note: reason };
      const bucketHours = days <= 7 ? 1 : 6;
      const end = snapshotMs();
      const start = end - days * 24 * HOUR;
      const obs = (byBattery(ctx).get(batteryId) ?? []).filter((o) => o.sensorId === sensor.id && Date.parse(o.t) >= start);
      const points: SeriesPoint[] = [];
      const n = Math.ceil((days * 24) / bucketHours);
      for (let i = 0; i < n; i++) {
        const t0 = start + i * bucketHours * HOUR;
        const t1 = t0 + bucketHours * HOUR;
        const inB = obs.filter((o) => { const t = Date.parse(o.t); return t >= t0 && t < t1 && o.quality === 'measured'; });
        const avg = (k: 'voltageV' | 'temperatureC') => {
          const v = inB.map((o) => o[k]).filter((x): x is number => x !== null);
          return v.length ? Math.round((v.reduce((a, c) => a + c, 0) / v.length) * 1000) / 1000 : null;
        };
        const res = inB.find((o) => o.resistanceMOhm !== null)?.resistanceMOhm ?? null;
        points.push({ t: new Date(t0).toISOString(), voltageV: avg('voltageV'), temperatureC: avg('temperatureC'), resistanceMOhm: res });
      }
      return { points, bucketHours, sensorSerial: sensor.serial, note: reason || 'Synthetic telemetry. Gaps are shown as gaps, not interpolated.' };
    },

    async stringPeers(batteryId, days) {
      await latency(ctx);
      authorize(ctx, 'telemetry.read');
      const d = db(ctx);
      const b = d.batteries.find((x) => x.id === batteryId);
      if (!b || !canSeeBattery(ctx, b)) return { points: [] };
      const asg = d.assignments.find((a) => a.id === b.currentAssignmentId);
      const slot = asg ? d.slots.find((s) => s.id === asg.slotId) : null;
      if (!slot) return { points: [] };
      const peerSlots = d.slots.filter((s) => s.stringId === slot.stringId);
      const peerIds = peerSlots.map((s) => d.assignments.find((a) => a.slotId === s.id && !a.endAt)?.batteryId).filter((x): x is string => !!x);
      const idx = byBattery(ctx);
      const end = snapshotMs();
      const start = end - days * 24 * HOUR;
      const bucket = 6 * HOUR;
      const points: { t: string; own: number | null; peerMedian: number | null }[] = [];
      for (let t0 = start; t0 < end; t0 += bucket) {
        const avgFor = (id: string) => {
          const v = (idx.get(id) ?? []).filter((o) => { const t = Date.parse(o.t); return t >= t0 && t < t0 + bucket && o.quality === 'measured' && o.voltageV !== null; }).map((o) => o.voltageV!);
          return v.length ? v.reduce((a, c) => a + c, 0) / v.length : null;
        };
        const own = avgFor(batteryId);
        const peers = peerIds.filter((id) => id !== batteryId).map(avgFor).filter((x): x is number => x !== null);
        points.push({ t: new Date(t0).toISOString(), own: own === null ? null : Math.round(own * 1000) / 1000, peerMedian: median(peers) === null ? null : Math.round(median(peers)! * 1000) / 1000 });
      }
      return { points };
    },

    async summary(batteryId) {
      await latency(ctx);
      authorize(ctx, 'telemetry.read');
      const b = db(ctx).batteries.find((x) => x.id === batteryId);
      if (!b || !canSeeBattery(ctx, b)) throw new Error('Not found');
      return telemetrySummaryFor(ctx, b);
    },

    async fleet() {
      await latency(ctx);
      authorize(ctx, 'telemetry.read');
      const d = db(ctx);
      const deployed = d.batteries.filter((b) => b.lifecycleState === 'deployed' && canSeeBattery(ctx, b));
      const sums = deployed.map((b) => telemetrySummaryFor(ctx, b));
      const monitored = sums.filter((s) => s.available);
      const comp = monitored.map((s) => s.completenessPct ?? 0);
      const gws = d.gateways.filter((g) => canSeeSite(ctx, d.sites.find((s) => s.id === g.siteId)!));
      return {
        monitoredBatteries: monitored.length, deployed: deployed.length, unmonitored: deployed.length - monitored.length,
        completenessPct: comp.length ? Math.round((comp.reduce((a, c) => a + c, 0) / comp.length) * 10) / 10 : null,
        staleGateways: gws.filter((g) => (snapshotMs() - Date.parse(g.lastSeenAt)) / 60_000 > g.samplingIntervalMin * 3).length,
      };
    },
  };
}
