'use client';
import * as RadixTabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

export interface TabItem {
  value: string;
  label: string;
  /** Short count or marker shown beside the label. */
  badge?: ReactNode;
  content: ReactNode;
}

/** Horizontally scrollable on phones so ten passport tabs stay reachable without wrapping. */
export function Tabs({
  tabs, value, onValueChange, label,
}: { tabs: TabItem[]; value: string; onValueChange: (v: string) => void; label: string }) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange}>
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <RadixTabs.List aria-label={label} className="flex min-w-max gap-1 border-b border-line md:min-w-0 md:flex-wrap">
          {tabs.map((t) => (
            <RadixTabs.Trigger
              key={t.value}
              value={t.value}
              className="relative -mb-px flex min-h-[44px] items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-muted hover:text-ink data-[state=active]:border-teal data-[state=active]:text-navy"
            >
              {t.label}
              {t.badge}
            </RadixTabs.Trigger>
          ))}
        </RadixTabs.List>
      </div>
      {tabs.map((t) => (
        <RadixTabs.Content key={t.value} value={t.value} className="pt-5 focus-visible:outline-none">
          {t.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
