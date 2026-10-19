import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runAgentLoop } from '@/services/agent/loop';
import { llmProvider, openAiProvider, toOpenAiMessages } from '@/services/agent/provider';
import { AGENT_TOOLS } from '@/services/agent/tools';

// A stand-in for any OpenAI-compatible server (vLLM, llama.cpp, LiteLLM). It records what it was sent and
// answers a first request with a tool call and a second with the final text.
let server: Server;
let base = '';
const seen: { auth?: string; body?: { model: string; messages: Record<string, unknown>[]; tools: unknown[] } }[] = [];
let chatCalls = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/v1/models') {
        res.end(JSON.stringify({ data: [{ id: 'embed-small' }, { id: 'qwen2.5-7b-instruct' }] }));
      } else if (req.url === '/v1/chat/completions') {
        seen.push({ auth: req.headers.authorization, body: JSON.parse(raw) });
        chatCalls += 1;
        res.end(JSON.stringify({
          choices: [{
            message: chatCalls === 1
              ? { content: null, tool_calls: [{ id: 'x', type: 'function', function: { name: 'get_collection_pipeline', arguments: '{}' } }] }
              : { content: 'Registered batteries: 12.' },
          }],
        }));
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

describe('LLM provider port', () => {
  it('chooses the provider from LLM_PROVIDER and defaults to a local Ollama', () => {
    expect(llmProvider({}).id).toBe('ollama');
    expect(llmProvider({ LLM_PROVIDER: 'openai' }).id).toBe('openai');
    expect(llmProvider({ LLM_PROVIDER: 'OpenAI' }).id).toBe('openai');
  });

  it('reports a clear reason when the OpenAI-compatible endpoint is not configured or not reachable', async () => {
    expect((await openAiProvider({}).status()).reason).toMatch(/LLM_BASE_URL/);
    const down = await openAiProvider({ LLM_BASE_URL: 'http://127.0.0.1:9/v1' }).status();
    expect(down.available).toBe(false);
    expect(down.reason).toMatch(/not reachable/);
  });

  it('lists models and prefers a configured one, then a standard instruction-tuned one', async () => {
    const auto = await openAiProvider({ LLM_BASE_URL: base }).status();
    expect(auto).toMatchObject({ available: true, model: 'qwen2.5-7b-instruct' });
    const set = await openAiProvider({ LLM_BASE_URL: base, LLM_MODEL: 'embed-small' }).status();
    expect(set.model).toBe('embed-small');
  });

  it('converts the loop conversation to the OpenAI format with matching tool-call ids', () => {
    const out = toOpenAiMessages([
      { role: 'system', content: 's' },
      { role: 'assistant', content: '', tool_calls: [{ function: { name: 'a', arguments: { x: 1 } } }, { function: { name: 'b', arguments: {} } }] },
      { role: 'tool', content: 'ra', tool_name: 'a' },
      { role: 'tool', content: 'rb', tool_name: 'b' },
    ]) as { role: string; tool_calls?: { id: string; function: { arguments: string } }[]; tool_call_id?: string }[];
    const ids = out[1].tool_calls!.map((c) => c.id);
    expect(out[1].tool_calls![0].function.arguments).toBe('{"x":1}');
    expect([out[2].tool_call_id, out[3].tool_call_id]).toEqual(ids);
    expect(new Set(ids).size).toBe(2);
  });

  it('drives the real agent loop through an OpenAI-compatible server and sends the key', async () => {
    chatCalls = 0;
    seen.length = 0;
    const provider = openAiProvider({ LLM_BASE_URL: base, LLM_API_KEY: 'k-test' });
    const st = await provider.status();
    const run = await runAgentLoop({
      goal: 'How many batteries are registered?', model: st.model!, chat: provider.chat(st.model!), tools: AGENT_TOOLS,
      runTool: async () => '{"registered":12}',
    });
    expect(run.stoppedBecause).toBe('answered');
    expect(run.steps.map((s) => s.tool)).toEqual(['get_collection_pipeline']);
    expect(run.answer).toContain('12');
    expect(run.ungroundedNumbers).toEqual([]);
    expect(seen[0].auth).toBe('Bearer k-test');
    expect(seen[0].body!.tools.length).toBe(AGENT_TOOLS.length);
    // The second request carries the tool result back, tied to the call that asked for it.
    const toolMsg = seen[1].body!.messages.find((m) => m.role === 'tool')!;
    expect(toolMsg.content).toBe('{"registered":12}');
    expect(toolMsg.tool_call_id).toBeTruthy();
  });
});
