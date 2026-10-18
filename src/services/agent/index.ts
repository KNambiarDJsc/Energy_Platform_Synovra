import { authorize, audit, type Ctx } from '../core';
import type { AgentService, Services } from '../types';
import { runAgentLoop, type ChatFn, type ChatMessage } from './loop';
import { AGENT_TOOLS, runTool, type ToolSpec } from './tools';

/**
 * A local language model through Ollama, for development. The model only chooses which read-only tool to
 * call and writes the final summary; every number must come from a tool, and the answer is checked for
 * numbers that did not. Nothing is sent outside this machine.
 */
const DEFAULT_URL = 'http://localhost:11434';

export function ollamaConfig() {
  const env = typeof process !== 'undefined' ? process.env : ({} as Record<string, string | undefined>);
  return {
    url: (env.NEXT_PUBLIC_OLLAMA_URL || env.OLLAMA_URL || DEFAULT_URL).replace(/\/$/, ''),
    model: env.NEXT_PUBLIC_OLLAMA_MODEL || env.OLLAMA_MODEL || '',
  };
}

export function ollamaChat(url: string, model: string): ChatFn {
  return async (messages: ChatMessage[], tools: ToolSpec[]) => {
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, messages, stream: false, think: false,
        tools: tools.map((t) => ({ type: 'function', function: t })),
        options: { temperature: 0, num_ctx: 8192, num_predict: 600 },
      }),
    });
    if (!res.ok) throw new Error(`Ollama answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { message: ChatMessage };
    return { role: 'assistant', content: body.message.content ?? '', tool_calls: body.message.tool_calls };
  };
}

export function createAgentService(ctx: Ctx, svc: () => Services): AgentService {
  const cfg = ollamaConfig();
  return {
    tools: () => AGENT_TOOLS.map((t) => ({ name: t.name, description: t.description })),

    async status() {
      try {
        const res = await fetch(`${cfg.url}/api/tags`, { signal: AbortSignal.timeout(2500) });
        if (!res.ok) return { available: false, url: cfg.url, model: null, models: [], reason: `Ollama answered ${res.status}.` };
        const models = ((await res.json()) as { models: { name: string }[] }).models.map((m) => m.name);
        // Prefer a configured model, then a standard instruction-tuned one, then whatever is installed.
        const preferred = cfg.model || models.find((m) => /qwen2\.5|qwen3|llama3\.[12]|mistral/i.test(m)) || models[0] || null;
        return { available: !!preferred, url: cfg.url, model: preferred, models, reason: preferred ? null : 'Ollama is running but no model is installed.' };
      } catch {
        return { available: false, url: cfg.url, model: null, models: [], reason: `Ollama is not reachable at ${cfg.url}.` };
      }
    },

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
      if (!st.available || !st.model) throw new Error(st.reason ?? 'Ollama is not available.');
      const model = opts.model && st.models.includes(opts.model) ? opts.model : st.model;
      const run = await runAgentLoop({
        goal: g, model, chat: ollamaChat(cfg.url, model), tools: AGENT_TOOLS, maxSteps: 6, onStep: opts.onStep,
        runTool: (name, args) => runTool(svc(), name, args),
      });
      this.recordRun(run);
      return run;
    },
  };
}
