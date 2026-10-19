import type { AgentStatus } from '../types';
import type { ChatFn, ChatMessage } from './loop';
import type { ToolSpec } from './tools';

/**
 * Where the agent's language model comes from. The loop only needs two things: whether a model is reachable,
 * and a function that takes the conversation and the tool list and returns the next message. Anything that
 * can do that plugs in here; nothing else in the agent changes.
 *
 *   LLM_PROVIDER=ollama   (default) a model running on this machine. Nothing leaves it.
 *   LLM_PROVIDER=openai   any server speaking the OpenAI chat-completions format (vLLM, llama.cpp server,
 *                         LiteLLM, a hosted API). The conversation, which contains record contents from the
 *                         tool results, is sent to LLM_BASE_URL, so choose that endpoint deliberately.
 */
export interface LlmProvider {
  id: 'ollama' | 'openai';
  status(): Promise<AgentStatus>;
  chat(model: string): ChatFn;
}

type Env = Record<string, string | undefined>;
const DEFAULT_OLLAMA = 'http://localhost:11434';
const PREFERRED = /qwen2\.5|qwen3|llama3\.[12]|mistral/i;

function pick(models: string[], configured: string): string | null {
  return configured || models.find((m) => PREFERRED.test(m)) || models[0] || null;
}

export function ollamaProvider(env: Env): LlmProvider {
  const url = (env.NEXT_PUBLIC_OLLAMA_URL || env.OLLAMA_URL || DEFAULT_OLLAMA).replace(/\/$/, '');
  const configured = env.NEXT_PUBLIC_OLLAMA_MODEL || env.OLLAMA_MODEL || '';
  return {
    id: 'ollama',
    async status() {
      try {
        const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2500) });
        if (!res.ok) return { available: false, url, model: null, models: [], reason: `Ollama answered ${res.status}.` };
        const models = ((await res.json()) as { models: { name: string }[] }).models.map((m) => m.name);
        const model = pick(models, configured);
        return { available: !!model, url, model, models, reason: model ? null : 'Ollama is running but no model is installed.' };
      } catch {
        return { available: false, url, model: null, models: [], reason: `Ollama is not reachable at ${url}.` };
      }
    },
    chat(model) {
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
    },
  };
}

/** The loop keeps tool calls as Ollama shapes them; the OpenAI format wants ids and JSON-string arguments. */
export function toOpenAiMessages(messages: ChatMessage[]): unknown[] {
  const out: unknown[] = [];
  let pending: string[] = [];
  let n = 0;
  for (const m of messages) {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      pending = m.tool_calls.map(() => `call_${++n}`);
      out.push({
        role: 'assistant', content: m.content || null,
        tool_calls: m.tool_calls.map((c, i) => ({ id: pending[i], type: 'function', function: { name: c.function.name, arguments: JSON.stringify(c.function.arguments ?? {}) } })),
      });
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: pending.shift() ?? `call_${++n}`, content: m.content });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

export function openAiProvider(env: Env): LlmProvider {
  const url = (env.LLM_BASE_URL || '').replace(/\/$/, '');
  const key = env.LLM_API_KEY || '';
  const configured = env.LLM_MODEL || '';
  const headers = { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) };
  return {
    id: 'openai',
    async status() {
      if (!url) return { available: false, url: '', model: null, models: [], reason: 'LLM_PROVIDER=openai needs LLM_BASE_URL (for example https://host/v1).' };
      try {
        const res = await fetch(`${url}/models`, { headers, signal: AbortSignal.timeout(4000) });
        if (!res.ok) return { available: false, url, model: configured || null, models: [], reason: `The model server answered ${res.status}.` };
        const models = ((await res.json()) as { data?: { id: string }[] }).data?.map((m) => m.id) ?? [];
        const model = pick(models, configured);
        return { available: !!model, url, model, models, reason: model ? null : 'The model server lists no models; set LLM_MODEL.' };
      } catch {
        return { available: false, url, model: null, models: [], reason: `The model server is not reachable at ${url}.` };
      }
    },
    chat(model) {
      return async (messages: ChatMessage[], tools: ToolSpec[]) => {
        const res = await fetch(`${url}/chat/completions`, {
          method: 'POST', headers,
          body: JSON.stringify({
            model, messages: toOpenAiMessages(messages), temperature: 0, max_tokens: 600,
            tools: tools.map((t) => ({ type: 'function', function: t })),
          }),
        });
        if (!res.ok) throw new Error(`The model server answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const body = (await res.json()) as { choices?: { message?: { content?: string | null; tool_calls?: { function: { name: string; arguments: string } }[] } }[] };
        const msg = body.choices?.[0]?.message;
        if (!msg) throw new Error('The model server returned no message.');
        const calls = (msg.tool_calls ?? []).map((c) => {
          let args: Record<string, unknown> = {};
          try { args = c.function.arguments ? (JSON.parse(c.function.arguments) as Record<string, unknown>) : {}; } catch { /* a malformed call runs with no arguments and the tool will refuse it */ }
          return { function: { name: c.function.name, arguments: args } };
        });
        return { role: 'assistant', content: msg.content ?? '', tool_calls: calls.length ? calls : undefined };
      };
    },
  };
}

export function llmProvider(env: Env = typeof process !== 'undefined' ? process.env : {}): LlmProvider {
  return (env.LLM_PROVIDER || 'ollama').toLowerCase() === 'openai' ? openAiProvider(env) : ollamaProvider(env);
}
