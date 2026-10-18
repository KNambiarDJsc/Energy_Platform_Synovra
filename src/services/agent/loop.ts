import type { AgentRun, AgentStep } from '../types';
import type { ToolSpec } from './tools';

/**
 * The agent loop: given a goal, the model decides which read-only tool to call next, reads the result, and
 * repeats until it can answer or runs out of steps. "Autonomous" here means it plans its own sequence of
 * look-ups. It cannot act: there is no tool that writes, controls equipment or decides a battery's route.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[];
  tool_name?: string;
}
export type ChatFn = (messages: ChatMessage[], tools: ToolSpec[]) => Promise<ChatMessage>;

export const SYSTEM_PROMPT = `You are the battery operations analyst for Synovra, a lead-acid battery revival business.
You answer by calling tools that read Synovra's records. Rules:
- Use tools for every fact and number. Never invent a number, battery, cost, price or result.
- Call several tools in sequence when the goal needs it, then answer.
- Name the batteries, batches or process versions your answer rests on, using labels from the tool results.
- If the records cannot answer, say so and say what data is missing.
- Results are observational and the data in this demonstration is synthetic: never claim one process causes better outcomes.
- You cannot change records, control chargers or equipment, give restoration or chemical procedures, or decide a battery's route. Suggest what a person should check.
- Answer in plain English, under 180 words, with short bullet points where helpful.`;

/** Numbers in the answer that appear in no tool result. Small counts and years are ignored. */
export function ungroundedNumbers(answer: string, toolText: string): string[] {
  const haystack = toolText.replace(/,/g, '');
  const nums = answer.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) ?? [];
  return [...new Set(nums)].filter((n) => {
    const v = Number(n);
    if (Number.isInteger(v) && (v <= 10 || (v >= 2000 && v <= 2100))) return false;
    if (haystack.includes(n)) return false;
    // allow simple rounding of a number that is present
    const rounded = (haystack.match(/\d+(?:\.\d+)?/g) ?? []).some((h) => Math.round(Number(h)) === Math.round(v) && Math.abs(Number(h) - v) < 1);
    return !rounded;
  });
}

export async function runAgentLoop(opts: {
  goal: string;
  chat: ChatFn;
  tools: ToolSpec[];
  runTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  model: string;
  maxSteps?: number;
  onStep?: (step: AgentStep) => void;
}): Promise<AgentRun> {
  const maxSteps = opts.maxSteps ?? 6;
  const allowed = new Set(opts.tools.map((t) => t.name));
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: opts.goal }];
  const steps: AgentStep[] = [];
  const started = Date.now();
  let toolText = '';
  for (let turn = 0; turn < maxSteps; turn++) {
    const reply = await opts.chat(messages, opts.tools);
    const calls = reply.tool_calls ?? [];
    if (calls.length === 0) {
      const answer = reply.content.trim();
      const ungrounded = ungroundedNumbers(answer, toolText);
      return {
        goal: opts.goal, model: opts.model, answer, steps, stoppedBecause: 'answered', ungroundedNumbers: ungrounded,
        seconds: Math.round((Date.now() - started) / 1000),
      };
    }
    messages.push({ role: 'assistant', content: reply.content ?? '', tool_calls: calls });
    for (const call of calls) {
      const name = call.function.name;
      const args = (call.function.arguments ?? {}) as Record<string, unknown>;
      const result = allowed.has(name) ? await opts.runTool(name, args) : JSON.stringify({ error: `Tool "${name}" is not allowed.` });
      toolText += `\n${result}`;
      const step: AgentStep = { tool: name, args, resultPreview: result.slice(0, 600), allowed: allowed.has(name) };
      steps.push(step);
      opts.onStep?.(step);
      messages.push({ role: 'tool', content: result, tool_name: name });
    }
  }
  return {
    goal: opts.goal, model: opts.model, answer: 'I reached the step limit before finishing. The tool results gathered so far are listed below.',
    steps, stoppedBecause: 'step_limit', ungroundedNumbers: [], seconds: Math.round((Date.now() - started) / 1000),
  };
}
