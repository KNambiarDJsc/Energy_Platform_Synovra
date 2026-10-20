'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Layout';
import { Drawer } from '@/components/ui/Overlay';
import { answer, BATTERY_SUGGESTIONS, SITE_SUGGESTIONS } from '@/lib/customer/ask';
import { useFleet } from '@/lib/customer/hooks';

/**
 * A quiet, contextual Ask. It knows which battery is open, answers from the records, and says what it used. The
 * questions asked are owned by the caller; the answers are worked out from them on each render, so nothing needs to
 * be stored or synchronised.
 */
export function AskPanel({ open, onOpenChange, batteryId, prompts, onAsk }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  batteryId: string | null;
  prompts: string[];
  onAsk: (prompt: string) => void;
}) {
  const { data } = useFleet(open);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const fleet = data.data?.passports ?? [];
  const current = batteryId ? fleet.find((p) => p.battery.id === batteryId) ?? null : null;

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [prompts.length, data.data]);

  const ask = (prompt: string) => {
    if (!prompt.trim()) return;
    onAsk(prompt.trim());
    setText('');
  };
  const suggestions = current ? BATTERY_SUGGESTIONS : SITE_SUGGESTIONS;
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Ask" description={current ? `About ${current.battery.label}` : 'About your batteries'}>
      <div className="flex min-h-[55vh] flex-col gap-4">
        <Notice tone="synthetic" title="Answers come from your records, by fixed rules">No AI model is connected. It reads what is on screen, says what it used, and never acts on equipment.</Notice>
        {prompts.length === 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Suggested questions">
            {suggestions.map((s) => (
              <li key={s}><button type="button" className="min-h-[40px] rounded-full bg-fill px-4 text-sm font-medium text-ink hover:bg-fill-2" onClick={() => ask(s)}>{s}</button></li>
            ))}
          </ul>
        )}
        <ol className="space-y-4" aria-live="polite">
          {prompts.map((prompt, i) => {
            const reply = data.data ? answer(prompt, fleet, current) : null;
            return (
              <li key={`${i}-${prompt}`} data-testid="ask-turn">
                <p className="text-sm font-medium text-ink">{prompt}</p>
                {reply ? (
                  <>
                    <p className="mt-1 whitespace-pre-line text-[15px] leading-6 text-ink-2">{reply.answer}</p>
                    {reply.used.length > 0 && <p className="mt-1 font-mono text-[12px] uppercase tracking-[0.05em] text-muted">Used: {reply.used.join(', ')}</p>}
                  </>
                ) : <p className="mt-1 text-sm text-muted">Reading your records…</p>}
              </li>
            );
          })}
        </ol>
        <div ref={end} />
        <form className="mt-auto flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
          <label htmlFor="ask-input" className="sr-only">Your question</label>
          <Input id="ask-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about your batteries" />
          <Button type="submit">Ask</Button>
        </form>
      </div>
    </Drawer>
  );
}
