import { describe, expect, it } from 'vitest';
import { runAgentLoop, ungroundedNumbers, type ChatFn, type ChatMessage } from '@/services/agent/loop';
import { AGENT_TOOLS, runTool } from '@/services/agent/tools';
import { harness, USERS } from './helpers';

/** A scripted stand-in for the model: returns the given replies in order. */
const scripted = (replies: ChatMessage[]): ChatFn => {
  let i = 0;
  return async () => replies[Math.min(i++, replies.length - 1)];
};
const call = (name: string, args: Record<string, unknown> = {}): ChatMessage => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });

describe('agent loop', () => {
  it('lets the model chain read-only tools, then checks its numbers against what the tools returned', async () => {
    const h = harness(USERS.eng);
    const pipeline = JSON.parse(await runTool(h.svc, 'get_collection_pipeline', {}));
    const registered = pipeline.chain_batteries_with_every_link_so_far[0].batteries;
    const steps: string[] = [];
    const run = await runAgentLoop({
      goal: 'Where is our data collection weakest?', model: 'scripted', tools: AGENT_TOOLS,
      chat: scripted([
        call('get_collection_pipeline'),
        call('get_battery_history', { label: 'B-0017' }),
        { role: 'assistant', content: `${registered} batteries are registered. Revival paid back 731 AED on average.` },
      ]),
      runTool: (n, a) => runTool(h.svc, n, a),
      onStep: (s) => steps.push(s.tool),
    });
    expect(steps).toEqual(['get_collection_pipeline', 'get_battery_history']);
    expect(run.stoppedBecause).toBe('answered');
    expect(run.ungroundedNumbers).toEqual(['731']);
    expect(run.steps[1].resultPreview).toMatch(/B-0017/);
  });

  it('refuses tools that are not on the list and stops at the step limit', async () => {
    const h = harness(USERS.eng);
    const run = await runAgentLoop({
      goal: 'Set the charger to 14.4 V', model: 'scripted', tools: AGENT_TOOLS, maxSteps: 2,
      chat: scripted([call('set_charger_voltage', { volts: 14.4 }), call('delete_battery', { label: 'B-0001' })]),
      runTool: (n, a) => runTool(h.svc, n, a),
    });
    expect(run.steps.map((s) => s.allowed)).toEqual([false, false]);
    expect(run.steps[0].resultPreview).toMatch(/not allowed/);
    expect(run.stoppedBecause).toBe('step_limit');
  });

  it('runs every tool with the caller\'s own permissions', async () => {
    const h = harness(USERS.eng);
    const history = JSON.parse(await runTool(h.svc, 'get_battery_history', { label: 'B-0005' }));
    expect(history.money_in).toBe('not visible to your role');
    h.as(USERS.lab);
    expect(JSON.parse(await runTool(h.svc, 'get_learning_loop', {})).error).toMatch(/prediction\.read/);
    expect(JSON.parse(await runTool(h.svc, 'get_battery_history', { label: 'B-9999' })).error).toMatch(/No battery/);
  });

  it('ignores small counts and years but flags invented figures', () => {
    expect(ungroundedNumbers('In 2026, 3 batteries cost AED 412.5 and 99 failed.', '{"cost":412.5}')).toEqual(['99']);
    expect(ungroundedNumbers('About 88% qualified.', '{"p":0.882,"pct":88.2}')).toEqual([]);
  });
});
