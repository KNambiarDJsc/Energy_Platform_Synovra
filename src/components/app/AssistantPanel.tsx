'use client';
import { Bot, Send, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Layout';
import { Drawer } from '@/components/ui/Overlay';
import { Badge } from '@/components/ui/Badge';
import { useAction } from '@/lib/hooks';
import type { AssistantCitation, AssistantResponse } from '@/services/types';

function citationHref(c: AssistantCitation): string | null {
  switch (c.kind) {
    case 'battery': return `/app/batteries/${c.id}`;
    case 'alert': return `/app/alerts?alert=${c.id}`;
    case 'test': return `/app/tests?test=${c.id}`;
    case 'attempt': return '/app/restoration';
    case 'prediction': return '/app/intelligence';
    case 'warranty': return null;
    case 'site': return '/app/deployments';
    default: return null;
  }
}

interface Turn {
  prompt: string;
  response?: AssistantResponse;
  confirmed?: string;
}

export function AssistantPanel({
  open, onOpenChange, batteryId, suggestions,
}: { open: boolean; onOpenChange: (o: boolean) => void; batteryId: string | null; suggestions: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const ask = useAction<string, AssistantResponse>((s, prompt) => s.assistant.ask(prompt, { batteryId }), {
    onSuccess: (response, prompt) =>
      setTurns((t) => t.map((x, i) => (i === t.length - 1 && x.prompt === prompt && !x.response ? { ...x, response } : x))),
    toastError: true,
  });
  const confirm = useAction<{ draftId: string; turn: number }, { kind: string; id: string; message: string }>(
    (s, a) => s.assistant.confirmDraft(a.draftId),
    {
      onSuccess: (r, a) => setTurns((t) => t.map((x, i) => (i === a.turn ? { ...x, confirmed: r.message } : x))),
      success: (r) => r.message,
    },
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns.length, ask.isPending]);

  function send(prompt: string) {
    const p = prompt.trim();
    if (!p || ask.isPending) return;
    setTurns((t) => [...t, { prompt: p }]);
    setText('');
    ask.mutate(p);
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Assistant"
      description="Reads records you are allowed to see and drafts for human review. It never acts on its own."
    >
      <div className="flex min-h-[60vh] flex-col gap-4">
        <Notice tone="synthetic" title="Mock assistant, no AI model connected">
          Answers are produced by fixed rules over synthetic records so the review flow can be tested. Drafts do nothing until you confirm them.
        </Notice>

        {turns.length === 0 && (
          <div>
            <p className="text-sm font-medium text-ink">Try one of these</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => send(s)}
                    className="min-h-[40px] rounded-full border border-[#9FB2BD] bg-white px-3 py-1.5 text-left text-sm text-ink hover:bg-canvas"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
            {batteryId && <p className="mt-3 text-xs text-muted">Context: the battery passport you are viewing.</p>}
          </div>
        )}

        <ol className="space-y-5" aria-live="polite">
          {turns.map((t, i) => (
            <li key={`${i}-${t.prompt}`} className="space-y-2">
              <p className="ml-auto max-w-[85%] rounded-lg bg-navy px-3 py-2 text-sm text-white">{t.prompt}</p>
              {!t.response ? (
                <p className="flex items-center gap-2 text-sm text-muted" role="status">
                  <Bot className="h-4 w-4 animate-pulse" aria-hidden /> Searching records you can access…
                </p>
              ) : (
                <div className="rounded-lg border border-line bg-white p-3 text-sm">
                  {t.response.refused && (
                    <Badge tone="amber" className="mb-2">
                      Not done
                    </Badge>
                  )}
                  <p className="whitespace-pre-line text-ink">{t.response.answer}</p>
                  {t.response.citations.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[13px] font-medium text-muted">Records cited</p>
                      <ul className="mt-1 space-y-1">
                        {t.response.citations.map((c) => {
                          const href = citationHref(c);
                          return (
                            <li key={`${c.kind}-${c.id}`} className="text-sm">
                              <span className="text-muted">{c.kind}: </span>
                              {href ? (
                                <Link href={href} className="text-teal-800 underline underline-offset-2" onClick={() => onOpenChange(false)}>
                                  {c.label}
                                </Link>
                              ) : (
                                c.label
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {!t.response.refused && <p className="mt-3 text-xs text-muted">Uncertainty: {t.response.uncertainty}</p>}
                  <p className="mt-1 text-xs text-muted">{t.response.scopeNote}</p>

                  {t.response.draft && (
                    <div className="mt-3 rounded-md border border-[#E8D6A8] bg-amber-50 p-3">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                        <ShieldCheck className="h-4 w-4" aria-hidden /> Draft, not created
                      </p>
                      <p className="mt-1 font-medium text-ink">{t.response.draft.title}</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-ink">{t.response.draft.body}</p>
                      {t.confirmed ? (
                        <p className="mt-2 text-sm font-medium text-approved-700" role="status">
                          {t.confirmed}
                        </p>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            loading={confirm.isPending}
                            onClick={() => confirm.mutate({ draftId: t.response!.draft!.id, turn: i })}
                          >
                            Confirm and create
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setTurns((all) =>
                                all.map((x, idx) =>
                                  idx === i && x.response ? { ...x, response: { ...x.response, draft: null } } : x,
                                ),
                              )
                            }
                          >
                            Discard draft
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-0 -mx-5 -mb-4 mt-4 flex gap-2 border-t border-line bg-white px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label htmlFor="assistant-input" className="sr-only">
          Ask the assistant
        </label>
        <input
          id="assistant-input"
          className="input"
          placeholder="Ask about records you can see"
          value={text}
          maxLength={400}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" loading={ask.isPending} icon={<Send className="h-4 w-4" aria-hidden />} aria-label="Send question">
          <span className="sr-only md:not-sr-only">Send</span>
        </Button>
      </form>
    </Drawer>
  );
}
