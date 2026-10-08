import { Autocomplete } from '@base-ui/react/autocomplete'
import { useLingui } from '@lingui/react/macro'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDownIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { db } from '@/lib/db'
import type { Provider } from '@/lib/settings'
import { loadPrices } from '@/lib/usage'

// Anthropic IDs are from its published model table;
// OpenAI/Gemini IDs checked against public pricing pages (2026-10) and limited to ones whose exact API ID is confirmed.
// Models used before (from the usage log) are added too.
const KNOWN: Record<Provider, string[]> = {
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-opus-5'],
  openai: ['gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.4', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1-mini'],
  google: ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'],
}

// Free-text model field with suggestions: pick a known model or type any model ID the provider accepts
export function ModelInput({ id, provider, value, onChange }: { id: string; provider: Provider; value: string; onChange: (v: string) => void }) {
  const { t } = useLingui()
  const used = useLiveQuery(() => db.usage.toArray().then((r) => r.filter((u) => u.provider === provider).map((u) => u.model)), [provider])
  const models = [...new Set([...KNOWN[provider], ...(used ?? [])])]
  const prices = loadPrices()
  const q = value.trim().toLowerCase()
  // an exact pick (or empty box) lists everything, so the dropdown works as a picker, not just a filter
  const shown = !q || models.includes(value.trim()) ? models : models.filter((m) => m.toLowerCase().includes(q))

  return (
    <Autocomplete.Root items={models} filteredItems={shown} value={value} onValueChange={(v) => onChange(v)} openOnInputClick>
      <div className="relative">
        <Autocomplete.Input id={id} placeholder={t`Pick or type a model ID`} render={<Input className="pr-9" />} />
        <Autocomplete.Trigger aria-label={t`Show models`} className="absolute inset-y-0 right-0 grid w-9 cursor-pointer place-items-center text-muted-foreground hover:text-foreground">
          <ChevronDownIcon className="size-4" />
        </Autocomplete.Trigger>
      </div>
      <Autocomplete.Portal>
        <Autocomplete.Positioner sideOffset={6} className="isolate z-50">
          <Autocomplete.Popup className="no-scrollbar max-h-[min(var(--available-height),20rem)] w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-[10px] bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 empty:hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <Autocomplete.List>
              {(m: string) => {
                const p = prices[m]
                return (
                  <Autocomplete.Item
                    key={m}
                    value={m}
                    className="flex cursor-default items-center justify-between gap-3 rounded-[6px] px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent"
                  >
                    <span className="font-mono">{m}</span>
                    {p && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        ${p.input} / ${p.output}
                      </span>
                    )}
                  </Autocomplete.Item>
                )
              }}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  )
}
