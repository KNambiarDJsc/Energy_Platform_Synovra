/**
 * Revive, test further or recycle: a transparent decision-support estimate for one battery.
 *
 * This is arithmetic over stated assumptions, not a learned prediction. The chance that a revival attempt
 * reaches a saleable grade comes from an observed cohort rate (or a person's entry) and is shown with
 * its sample size. Every input is visible and editable; a missing input means no recommendation.
 *
 *   revive  = p·sale + (1 − p)·recycling − treatment − revive logistics − p·warranty allowance
 *   recycle = recycling − recycle logistics
 *   p*      = the probability at which the two are equal (break-even)
 *
 * "Test further" is suggested when the evidence for p is thin (small cohort) or p sits close to p*,
 * because then a better measurement could change the decision. Its cost is shown, not hidden.
 */
export interface RouteInputs {
  /** Probability (0–1) that an attempt reaches the saleable grade. */
  pSaleable: number | null;
  /** Battery count behind pSaleable; null when a person entered it. */
  cohortN: number | null;
  salePriceAed: number | null;
  recyclingValueAed: number | null;
  treatmentCostAed: number | null;
  reviveLogisticsAed: number | null;
  recycleLogisticsAed: number | null;
  /** Expected warranty or return cost per battery sold. */
  warrantyAllowanceAed: number | null;
  furtherTestCostAed: number | null;
}

export type Route = 'revive' | 'test' | 'recycle';

export interface RouteLine { label: string; aed: number }
export interface RouteResult {
  revive: { value: number | null; lines: RouteLine[] };
  recycle: { value: number | null; lines: RouteLine[] };
  test: { cost: number | null };
  breakEvenP: number | null;
  /** Inputs that must be filled before any route can be suggested. */
  missing: string[];
  suggestion: Route | null;
  why: string;
}

/** Cohorts smaller than this are thin evidence for a probability. */
export const THIN_COHORT = 10;
/** Distance from break-even, in probability, inside which more testing is suggested. */
export const CLOSE_CALL = 0.1;

const LABELS: Record<keyof RouteInputs, string> = {
  pSaleable: 'Chance of reaching saleable grade',
  cohortN: 'Cohort size',
  salePriceAed: 'Sale price if saleable',
  recyclingValueAed: 'Recycling value',
  treatmentCostAed: 'Treatment and retest cost',
  reviveLogisticsAed: 'Logistics if revived',
  recycleLogisticsAed: 'Logistics if recycled',
  warrantyAllowanceAed: 'Warranty allowance per sale',
  furtherTestCostAed: 'Cost of a further test',
};

const round = (n: number) => Math.round(n * 100) / 100;

export function routeEconomics(i: RouteInputs): RouteResult {
  const required: (keyof RouteInputs)[] = ['pSaleable', 'salePriceAed', 'recyclingValueAed', 'treatmentCostAed', 'reviveLogisticsAed', 'recycleLogisticsAed', 'warrantyAllowanceAed'];
  const missing = required.filter((k) => i[k] === null || i[k] === undefined || Number.isNaN(i[k] as number)).map((k) => LABELS[k]);
  const p = i.pSaleable;
  if (p !== null && (p < 0 || p > 1)) missing.push('Chance must be between 0% and 100%');
  if (missing.length) {
    return {
      revive: { value: null, lines: [] }, recycle: { value: null, lines: [] }, test: { cost: i.furtherTestCostAed },
      breakEvenP: null, missing, suggestion: null,
      why: `No suggestion until these are filled: ${missing.join(', ').toLowerCase()}.`,
    };
  }
  const sale = i.salePriceAed!;
  const rec = i.recyclingValueAed!;
  const prob = p!;
  const reviveLines: RouteLine[] = [
    { label: `Sale, ${Math.round(prob * 100)}% chance`, aed: round(prob * sale) },
    { label: `Recycling if it fails, ${Math.round((1 - prob) * 100)}% chance`, aed: round((1 - prob) * rec) },
    { label: 'Treatment and retest', aed: -i.treatmentCostAed! },
    { label: 'Logistics', aed: -i.reviveLogisticsAed! },
    { label: 'Warranty allowance', aed: round(-prob * i.warrantyAllowanceAed!) },
  ];
  const recycleLines: RouteLine[] = [
    { label: 'Recycling value', aed: rec },
    { label: 'Logistics', aed: -i.recycleLogisticsAed! },
  ];
  const revive = round(reviveLines.reduce((s, l) => s + l.aed, 0));
  const recycle = round(recycleLines.reduce((s, l) => s + l.aed, 0));
  const slope = sale - rec - i.warrantyAllowanceAed!;
  const breakEvenP = slope > 0 ? (i.treatmentCostAed! + i.reviveLogisticsAed! - i.recycleLogisticsAed!) / slope : null;

  let suggestion: Route;
  let why: string;
  const thin = i.cohortN !== null && i.cohortN < THIN_COHORT;
  const close = breakEvenP !== null && Math.abs(prob - breakEvenP) < CLOSE_CALL;
  if ((thin || close) && i.furtherTestCostAed !== null) {
    suggestion = 'test';
    why = thin
      ? `The chance comes from only ${i.cohortN} batteries, too few to rely on. A further test (AED ${i.furtherTestCostAed}) could change the decision.`
      : `The chance (${Math.round(prob * 100)}%) is within ${Math.round(CLOSE_CALL * 100)} points of break-even (${Math.round(breakEvenP! * 100)}%), so a better measurement could change the decision. A further test costs AED ${i.furtherTestCostAed}.`;
  } else if (revive > recycle) {
    suggestion = 'revive';
    why = `Reviving is worth AED ${round(revive - recycle)} more than recycling under these assumptions.`;
  } else {
    suggestion = 'recycle';
    why = `Recycling is worth AED ${round(recycle - revive)} more than reviving under these assumptions.`;
  }
  return { revive: { value: revive, lines: reviveLines }, recycle: { value: recycle, lines: recycleLines }, test: { cost: i.furtherTestCostAed }, breakEvenP, missing: [], suggestion, why };
}
