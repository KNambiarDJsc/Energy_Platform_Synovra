import { describe, expect, it } from 'vitest';
import { LIFECYCLE_ORDER, NEXT_STEP_BY_STATE, nextStepFor } from '@/domain/lifecycle';

describe('next step rule', () => {
  it('has a step for every lifecycle state, and none is empty', () => {
    for (const state of LIFECYCLE_ORDER) expect(NEXT_STEP_BY_STATE[state].trim().length).toBeGreaterThan(10);
  });

  it('puts a doubtful identity ahead of the lifecycle step', () => {
    expect(nextStepFor('qualified', { level: 'conflict' })).toEqual({ text: 'Resolve the identity conflict first.', attention: true });
    expect(nextStepFor('qualified', { level: 'complete' })).toEqual({ text: NEXT_STEP_BY_STATE.qualified, attention: false });
  });

  it('flags the states that wait on a person', () => {
    expect(nextStepFor('awaiting_review').attention).toBe(true);
    expect(nextStepFor('deployed').attention).toBe(false);
  });

  it('never reads a measurement: the same state always gives the same step', () => {
    expect(nextStepFor('received')).toEqual(nextStepFor('received', { level: 'partial' }));
  });
});
