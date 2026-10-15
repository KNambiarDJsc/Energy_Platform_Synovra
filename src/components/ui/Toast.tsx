'use client';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}
interface ToastApi {
  success(message: string): void;
  error(message: string): void;
  info(message: string): void;
}

const ToastContext = createContext<ToastApi>({ success() {}, error() {}, info() {} });

const ICON = { success: CheckCircle2, error: XCircle, info: Info } as const;
// Light tints that read on the dark notification surface (icons are not text; each is above 3:1).
const ICON_TONE = { success: 'text-[#4ADE80]', error: 'text-[#FF8A80]', info: 'text-teal-bright' } as const;

/** Notifications float above the page as one dark capsule, centred, and leave on their own. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => setItems((cur) => cur.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (kind: ToastKind, message: string) => {
      counter.current += 1;
      const id = counter.current;
      setItems((cur) => [...cur.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 9000 : 5000);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-8"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {items.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className="anim-toast pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg bg-[#1D1D1F] py-3 pl-4 pr-3 text-sm text-white shadow-hud"
            >
              <Icon className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${ICON_TONE[t.kind]}`} aria-hidden />
              <p className="flex-1 text-white">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="-my-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
