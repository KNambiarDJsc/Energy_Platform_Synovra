/**
 * Operating limits the demonstration rules use. PLACEHOLDERS: Synovra engineering owns the real values,
 * per battery family and site. They are shown in the interface with their rule name and version, so
 * nobody mistakes them for a manufacturer specification.
 */
export const TEMPERATURE_RULE = {
  name: 'temperature-limit',
  version: '1.4.0',
  /** Readings above this count towards "hours above watch level" in the telemetry summary. */
  watchC: 30,
  /** Three consecutive readings above this raise an alert. */
  limitC: 35,
} as const;

/** Range drawn on the temperature scale. Display only. */
export const TEMPERATURE_SCALE = { minC: 0, maxC: 50 } as const;
