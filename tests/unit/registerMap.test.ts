import { describe, expect, it } from 'vitest';
import { EXAMPLE_REGISTER_MAP, decodeRegisters, validateRegisterMap, type RegisterMap } from '@/domain/registerMap';

const ctx = { sensorId: 's1', batteryId: 'b1', readAt: '2026-10-13T06:00:00.000Z', now: '2026-10-13T06:00:05.000Z' };

describe('register map decoder', () => {
  it('decodes unsigned, signed and 32-bit registers with scale', () => {
    // 1265 * 0.01 = 12.65 V; 251 * 0.1 = 25.1 C; 4600 * 0.001 = 4.6 mOhm (high word 0, low word 4600)
    const { observation, rejected } = decodeRegisters(EXAMPLE_REGISTER_MAP, { 0: 1265, 1: 251, 2: 0, 3: 4600 }, ctx);
    expect(observation).toMatchObject({ voltageV: 12.65, temperatureC: 25.1, resistanceMOhm: 4.6, quality: 'measured', sensorId: 's1', batteryId: 'b1' });
    expect(rejected).toEqual([]);
  });

  it('reads a negative s16 as two\'s complement', () => {
    const { observation } = decodeRegisters(EXAMPLE_REGISTER_MAP, { 0: 1265, 1: 0xfff6 /* -10 */, 2: 0, 3: 4600 }, ctx);
    expect(observation.temperatureC).toBe(-1);
  });

  it('honours word order for 32-bit values', () => {
    const map: RegisterMap = { id: 'wo-test', name: 'wo', description: '', registers: [{ address: 10, metric: 'resistanceMOhm', type: 'u32', wordOrder: 'low-first', scale: 0.001, min: 0.1, max: 200000 }] };
    // value 70000 = 0x0001_1170 -> high word 1, low word 0x1170 (4464); low-first puts the low word at the lower address
    expect(decodeRegisters(map, { 10: 0x1170, 11: 1 }, ctx).observation.resistanceMOhm).toBe(70);
    const high = { ...map, registers: [{ ...map.registers[0], wordOrder: 'high-first' as const }] };
    expect(decodeRegisters(high, { 10: 1, 11: 0x1170 }, ctx).observation.resistanceMOhm).toBe(70);
  });

  it('drops an implausible value instead of clamping it, and says why', () => {
    // Wrong scale on the device: 12650 raw would be 126.5 V.
    const { observation, rejected } = decodeRegisters(EXAMPLE_REGISTER_MAP, { 0: 12650, 1: 251, 2: 0, 3: 4600 }, ctx);
    expect(observation.voltageV).toBeNull();
    expect(observation.temperatureC).toBe(25.1);
    expect(observation.quality).toBe('measured');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ metric: 'voltageV', address: 0 });
    expect(rejected[0].reason).toMatch(/outside 4 to 18/);
  });

  it('treats the device\'s no-reading sentinel and absent registers as missing', () => {
    const { observation, rejected } = decodeRegisters(EXAMPLE_REGISTER_MAP, { 0: 65535 }, ctx);
    expect(observation).toMatchObject({ voltageV: null, temperatureC: null, resistanceMOhm: null, quality: 'missing' });
    expect(rejected.map((r) => r.reason)).toEqual([expect.stringMatching(/no reading/), expect.stringMatching(/not present/), expect.stringMatching(/not present/)]);
  });

  it('marks an old read as stale only when a limit is given', () => {
    const words = { 0: 1265, 1: 251, 2: 0, 3: 4600 };
    const late = { ...ctx, now: '2026-10-13T06:10:00.000Z' };
    expect(decodeRegisters(EXAMPLE_REGISTER_MAP, words, late).observation.quality).toBe('measured');
    expect(decodeRegisters(EXAMPLE_REGISTER_MAP, words, { ...late, maxAgeMs: 60_000 }).observation.quality).toBe('stale');
  });

  it('rejects a map with overlapping registers, a duplicated metric or a bad range', () => {
    const base = EXAMPLE_REGISTER_MAP;
    expect(validateRegisterMap(base)).toBe(base);
    expect(() => validateRegisterMap({ ...base, registers: [base.registers[0], { ...base.registers[1], metric: 'temperatureC', address: 0 }] })).toThrow(/overlaps/);
    expect(() => validateRegisterMap({ ...base, registers: [base.registers[0], { ...base.registers[0], address: 5 }] })).toThrow(/mapped twice/);
    expect(() => validateRegisterMap({ ...base, registers: [{ ...base.registers[0], min: 5, max: 5 }] })).toThrow(/min must be below max/);
    expect(() => validateRegisterMap({ ...base, registers: [{ ...base.registers[0], scale: 0 }] })).toThrow(/non-zero/);
    expect(() => validateRegisterMap({ ...base, registers: [] })).toThrow(/no registers/);
    // a 32-bit value at 2 occupies 2 and 3
    expect(() => validateRegisterMap({ ...base, registers: [base.registers[2], { ...base.registers[0], address: 3 }] })).toThrow(/overlaps/);
  });
});
