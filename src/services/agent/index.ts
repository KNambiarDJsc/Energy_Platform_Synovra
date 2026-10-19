import { authorize, audit, type Ctx } from '../core';
import type { AgentService, Services } from '../types';
import { runAgentLoop } from './loop';
import { llmProvider } from './provider';
import { AGENT_TOOLS, runTool } from './tools';

export { llmProvider, ollamaProvider, openAiProvider } from './provider';

export function createAgentService(ctx: Ctx, svc: () => Services): AgentService {
  const provider = llmProvider();
  return {
    tools: () => AGENT_TOOLS.map((t) => ({ name: t.name, description: t.description })),

    status: () => provider.status(),

    checkAccess() {
      authorize(ctx, 'prediction.read');
    },

    recordRun(run) {
      audit(ctx, 'agent.run', 'agent', run.model, `Goal (${run.goal.length} chars); tools: ${run.steps.map((s) => s.tool).join(', ') || 'none'}; ${run.stoppedBecause}; ${run.ungroundedNumbers.length} ungrounded numbers`);
      ctx.store.save();
    },

    async run(goal, opts = {}) {
      this.checkAccess();
      const g = goal.trim().slice(0, 600);
      if (!g) throw new Error('Give the agent a goal.');
      const st = await this.status();
      if (!st.available || !st.model) throw new Error(st.reason ?? 'No language model is available.');
      const model = opts.model && st.models.includes(opts.model) ? opts.model : st.model;
      const run = await runAgentLoop({
        goal: g, model, chat: provider.chat(model), tools: AGENT_TOOLS, maxSteps: 6, onStep: opts.onStep,
        runTool: (name, args) => runTool(svc(), name, args),
      });
      this.recordRun(run);
      return run;
    },
  };
}
