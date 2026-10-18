/**
 * A model card written by ml/train_restoration.py. Registration refuses anything that cannot be traced:
 * a failed gate, no training records, or missing hashes for the data, the code and the artifact.
 * Registration only ever creates a shadow version; promotion is a separate, signed-off step.
 */
export interface ModelCard {
  name: string; version: string; baseline: string; training_cohort: string; evaluation_report: string;
  gate: { passed: boolean; reasons: string[] };
  lineage?: { data_snapshot_sha256?: string | null; code_sha256?: string | null; artifact_sha256?: string | null; report_sha256?: string | null };
  training_records: { record_kind: 'restoration_attempt'; record_id: string; battery_id: string }[];
}

const SHA = /^[0-9a-f]{64}$/;

export function validateCard(card: ModelCard): void {
  if (!card.gate?.passed) throw new Error(`Refused: the checks did not all pass (${(card.gate?.reasons ?? []).join('; ') || 'no reasons given'}).`);
  if (!card.training_records?.length) throw new Error('Refused: a model version must name the records it was trained on.');
  const l = card.lineage ?? {};
  const missing = (['data_snapshot_sha256', 'code_sha256', 'artifact_sha256', 'report_sha256'] as const).filter((k) => !SHA.test(l[k] ?? ''));
  if (missing.length) throw new Error(`Refused: the card has no valid hash for ${missing.join(', ')}.`);
  if (!card.evaluation_report?.includes(`#sha256=${l.report_sha256}`)) throw new Error('Refused: the evaluation report reference does not carry the report hash.');
}
