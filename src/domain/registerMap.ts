import type { ISODateTime, ObservationQuality, TelemetryObservation } from './types';

/**
 * A register map says where a device keeps each reading in its 16-bit registers, and how to turn the raw number
 * into a physical value. It is plain data, written per device model from that model's own documentation.
 *
 * This file only decodes words that something else already read. It opens no connection and speaks no protocol
 * (Modbus, CAN or otherwise): a site gateway does that, outside this repository, and hands the words here. It
 * never clamps or repairs a value. A reading outside its plausible range is dropped, reported with the reason,
 * and the observation says it is missing, so a wrong scale factor shows up as gaps instead of believable data.
 *
 * The map below is an illustration of the format, not any manufacturer's real layout. Nothing here has been
 * checked against a device.
 */
export type RegisterMetric = 'voltageV' | 'temperatureC' | 'resistanceMOhm';

export interface RegisterDef {
  /** Address of the first register. 32-bit values use this one and the next. */
  address: number;
  metric: RegisterMetric;
  type: 'u16' | 's16' | 'u32' | 's32';
  /** For 32-bit values: which register holds the high half. Defaults to the lower address. */
  wordOrder?: 'high-first' | 'low-first';
  /** physical = raw * scale + offset */
  scale: number;
  offset?: number;
  /** Physical range that can be believed for this device. Anything outside is dropped, never clamped. */
  min: number;
  max: number;
  /** Raw values the device uses to say "no reading" (for example 65535). */
  invalid?: number[];
}

export interface RegisterMap {
  id: string;
  name: string;
  description: string;
  registers: RegisterDef[];
}

export const EXAMPLE_REGISTER_MAP: RegisterMap = {
  id: 'example-12v-monitor',
  name: 'Example: 12 V block monitor (illustration only)',
  description: 'Shows the format. Voltage in 10 mV steps, temperature in 0.1 °C steps with an offset, resistance as a 32-bit value in µΩ. Not a real device.',
  registers: [
    { address: 0, metric: 'voltageV', type: 'u16', scale: 0.01, min: 4, max: 18, invalid: [65535] },
    { address: 1, metric: 'temperatureC', type: 's16', scale: 0.1, min: -40, max: 100, invalid: [-32768] },
    { address: 2, metric: 'resistanceMOhm', type: 'u32', wordOrder: 'high-first', scale: 0.001, min: 0.1, max: 200, invalid: [4294967295] },
  ],
};

const WORDS = { u16: 1, s16: 1, u32: 2, s32: 2 } as const;

export function validateRegisterMap(raw: unknown): RegisterMap {
  const m = raw as Partial<RegisterMap> | null;
  const bad = (msg: string): never => { throw new Error(`Register map ${m && typeof m === 'object' && m.id ? `"${m.id}" ` : ''}is invalid: ${msg}`); };
  if (!m || typeof m !== 'object') return bad('it is not an object.');
  if (typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,60}$/.test(m.id)) bad('id must be lower-case letters, digits and dashes.');
  if (typeof m.name !== 'string' || !m.name.trim()) bad('name is required.');
  if (!Array.isArray(m.registers) || m.registers.length === 0) bad('it lists no registers.');
  const taken = new Map<number, string>();
  const seenMetric = new Set<string>();
  for (const r of m.registers!) {
    const where = `${r.metric} at ${r.address}`;
    if (!['voltageV', 'temperatureC', 'resistanceMOhm'].includes(r.metric)) bad(`${where}: unknown metric.`);
    if (!(r.type in WORDS)) bad(`${where}: type must be u16, s16, u32 or s32.`);
    if (!Number.isInteger(r.address) || r.address < 0 || r.address > 65535) bad(`${where}: address must be 0 to 65535.`);
    if (!Number.isFinite(r.scale) || r.scale === 0) bad(`${where}: scale must be a non-zero number.`);
    if (!Number.isFinite(r.min) || !Number.isFinite(r.max) || r.min >= r.max) bad(`${where}: min must be below max.`);
    if (seenMetric.has(r.metric)) bad(`${r.metric} is mapped twice.`);
    seenMetric.add(r.metric);
    for (let i = 0; i < WORDS[r.type]; i++) {
      const owner = taken.get(r.address + i);
      if (owner) bad(`${where} overlaps ${owner}.`);
      taken.set(r.address + i, where);
    }
  }
  return m as RegisterMap;
}

export interface DecodeContext {
  sensorId: string;
  batteryId: string;
  /** When the device was read. */
  readAt: ISODateTime;
  /** The time now. A reading older than `maxAgeMs` is marked stale. */
  now: ISODateTime;
  maxAgeMs?: number;
}

export interface DecodeResult {
  observation: TelemetryObservation;
  /** Every reading that was dropped, and why. Empty when all mapped registers decoded. */
  rejected: { metric: RegisterMetric; address: number; reason: string }[];
}

function raw(def: RegisterDef, words: Readonly<Record<number, number>>): number | null {
  const need = WORDS[def.type];
  const got: number[] = [];
  for (let i = 0; i < need; i++) {
    const w = words[def.address + i];
    if (w === undefined || !Number.isInteger(w) || w < 0 || w > 0xffff) return null;
    got.push(w);
  }
  if (need === 1) return def.type === 's16' && got[0] > 0x7fff ? got[0] - 0x10000 : got[0];
  const [hi, lo] = def.wordOrder === 'low-first' ? [got[1], got[0]] : [got[0], got[1]];
  const u = hi * 0x10000 + lo;
  return def.type === 's32' && u > 0x7fffffff ? u - 0x100000000 : u;
}

/** Turns one device read (register address -> 16-bit word) into one observation. */
export function decodeRegisters(map: RegisterMap, words: Readonly<Record<number, number>>, ctx: DecodeContext): DecodeResult {
  const values: Record<RegisterMetric, number | null> = { voltageV: null, temperatureC: null, resistanceMOhm: null };
  const rejected: DecodeResult['rejected'] = [];
  for (const def of map.registers) {
    const r = raw(def, words);
    if (r === null) { rejected.push({ metric: def.metric, address: def.address, reason: 'Register not present in the read.' }); continue; }
    if (def.invalid?.includes(r)) { rejected.push({ metric: def.metric, address: def.address, reason: `Device reports no reading (${r}).` }); continue; }
    const physical = r * def.scale + (def.offset ?? 0);
    if (physical < def.min || physical > def.max) {
      rejected.push({ metric: def.metric, address: def.address, reason: `${physical.toFixed(3)} is outside ${def.min} to ${def.max}; check the scale and offset in the map.` });
      continue;
    }
    values[def.metric] = Math.round(physical * 1e6) / 1e6;
  }
  const anyValue = Object.values(values).some((v) => v !== null);
  const ageMs = Date.parse(ctx.now) - Date.parse(ctx.readAt);
  const quality: ObservationQuality = !anyValue ? 'missing' : ctx.maxAgeMs !== undefined && ageMs > ctx.maxAgeMs ? 'stale' : 'measured';
  return {
    observation: { t: ctx.readAt, sensorId: ctx.sensorId, batteryId: ctx.batteryId, ...values, quality },
    rejected,
  };
}
