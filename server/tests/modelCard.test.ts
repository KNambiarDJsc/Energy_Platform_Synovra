import { describe, expect, it } from 'vitest';
import { validateCard, type ModelCard } from '../src/db/modelCard';

const sha = (c: string) => c.repeat(64);
const good = (): ModelCard => ({
  name: 'restoration-triage', version: '0.1.0-x', baseline: 'rule', training_cohort: '28 rows',
  evaluation_report: `ml/out/x/report.md#sha256=${sha('d')}`, gate: { passed: true, reasons: [] },
  lineage: { data_snapshot_sha256: sha('a'), code_sha256: sha('b'), artifact_sha256: sha('c'), report_sha256: sha('d') },
  training_records: [{ record_kind: 'restoration_attempt', record_id: 'att_1', battery_id: 'b1' }],
});

describe('model card registration', () => {
  it('accepts a traceable card that passed every check', () => {
    expect(() => validateCard(good())).not.toThrow();
  });

  it('refuses a failed gate, no training records, a missing hash, or a report reference without its hash', () => {
    expect(() => validateCard({ ...good(), gate: { passed: false, reasons: ['calibration: ECE 0.2'] } })).toThrow(/did not all pass.*calibration/);
    expect(() => validateCard({ ...good(), training_records: [] })).toThrow(/name the records/);
    const noArtifact = good();
    noArtifact.lineage!.artifact_sha256 = null;
    expect(() => validateCard(noArtifact)).toThrow(/artifact_sha256/);
    expect(() => validateCard({ ...good(), lineage: undefined })).toThrow(/data_snapshot_sha256/);
    expect(() => validateCard({ ...good(), evaluation_report: 'ml/out/x/report.md' })).toThrow(/report hash/);
  });

  it('refuses the card the pipeline writes for the demo data, because its gate did not pass', () => {
    // Shape of the card ml/train_restoration.py writes when the readiness gate fails.
    const demo = { ...good(), gate: { passed: false, reasons: ['2 attempts that did not qualify; need at least 20'] }, lineage: undefined };
    expect(() => validateCard(demo as ModelCard)).toThrow(/need at least 20/);
  });
});
