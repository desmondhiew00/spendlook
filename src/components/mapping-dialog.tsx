import { Trans, useLingui } from '@lingui/react/macro'
import { Loader2, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Picker } from '@/components/picker'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { checkDateFormat, guessToMapping, localGuess, type MappingBase, sampleForAi } from '@/lib/custom/ai'
import { clean, parseCustom, validateMapping } from '@/lib/custom/parse'
import { DELIMITERS, type Delimiter, ENCODINGS, type Encoding, readRows } from '@/lib/custom/sniff'
import { DATE_FORMATS, type DateFormat, fractionDigits } from '@/lib/custom/values'
import { formatMoney } from '@/lib/format'
import { loadSettings, PROVIDER_LABEL } from '@/lib/settings'
import type { Account, CustomMapping, ParsedRow } from '@/lib/types'
import { aiMappingFor } from '@/lib/usage'

const PREVIEW_ROWS = 10
const NONE = 'none'

// Confirm (or build) how a custom CSV's columns map to transactions, against a live preview of the parsed rows
export function MappingDialog({
  account,
  fileName,
  bytes,
  initial,
  initialMapping,
  onCancel,
  onConfirm,
}: {
  account: Account
  fileName: string
  bytes: ArrayBuffer
  initial: MappingBase
  initialMapping?: CustomMapping
  onCancel: () => void
  onConfirm: (mapping: CustomMapping, rows: ParsedRow[]) => void
}) {
  const { t, i18n } = useLingui()
  const settings = loadSettings()
  const [encoding, setEncoding] = useState<Encoding>(initial.encoding)
  const [delimiter, setDelimiter] = useState<Delimiter>(initial.delimiter)
  const rows = useMemo(() => readRows(bytes, encoding, delimiter), [bytes, encoding, delimiter])
  const [headerRow, setHeaderRow] = useState(initial.headerRow)
  const base: MappingBase = useMemo(() => ({ encoding, delimiter, headerRow, header: (rows[headerRow] ?? []).map(clean) }), [encoding, delimiter, headerRow, rows])
  const [mapping, setMapping] = useState<CustomMapping>(() => initialMapping ?? localGuess(base, sampleForAi(rows, headerRow).samples))
  const [ai, setAi] = useState<'idle' | 'running' | 'error'>('idle')
  const digits = fractionDigits(account.currency)

  // changing how the file is read invalidates the column picks
  const reread = (next: Partial<MappingBase>) => {
    const e = next.encoding ?? encoding
    const d = next.delimiter ?? delimiter
    const h = next.headerRow ?? headerRow
    const r = readRows(bytes, e, d)
    setEncoding(e)
    setDelimiter(d)
    setHeaderRow(h)
    setMapping(localGuess({ encoding: e, delimiter: d, headerRow: h, header: (r[h] ?? []).map(clean) }, sampleForAi(r, h).samples))
  }
  const set = (patch: Partial<CustomMapping>) => setMapping((m) => ({ ...m, ...patch, ...base }))

  const noHeader = headerRow < 0

  async function detect() {
    if (!settings?.verified || noHeader) return
    setAi('running')
    try {
      const { header, samples } = sampleForAi(rows, headerRow)
      const m = guessToMapping(await aiMappingFor(settings)(header, samples), base)
      setMapping({
        ...m,
        dateFormat: checkDateFormat(
          m.dateFormat,
          rows.slice(headerRow + 1, headerRow + 51).map((r) => r[m.dateCol] ?? ''),
        ),
      })
      setAi('idle')
    } catch (e) {
      console.error(e)
      setAi('error')
    }
  }

  const current: CustomMapping = { ...mapping, ...base }
  const errors = validateMapping(current, base.header.length)
  let preview: ParsedRow[] = []
  let all: ParsedRow[] = []
  let parseError = ''
  if (!errors.length) {
    try {
      all = parseCustom(rows, current, digits)
      preview = all.slice(0, PREVIEW_ROWS)
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e)
    }
  }
  const canSave = !errors.length && !parseError && all.length > 0

  const columns = base.header.map((h, i) => ({ value: String(i), label: h || t`Column ${i + 1}` }))
  const optional = [{ value: NONE, label: t`None` }, ...columns]
  const toCol = (v: string) => (v === NONE ? undefined : Number(v))
  const err = (k: string) =>
    errors.includes(k) && (
      <span className="text-xs text-destructive">
        <Trans>Check this column</Trans>
      </span>
    )
  const rowOptions = [
    ...(noHeader ? [{ value: '-1', label: t`Choose the header row` }] : []),
    ...rows.slice(0, 20).map((r, i) => ({ value: String(i), label: `${i + 1}: ${r.map(clean).filter(Boolean).join(' · ').slice(0, 60) || '—'}` })),
  ]
  const dateLabels: Record<DateFormat, string> = { YMD: '2026-09-03', DMY: '03/09/2026', MDY: '09/03/2026', YYYYMMDD: '20260903', 'D MMM Y': '3 Sep 2026' }
  const delimiterLabels: Record<Delimiter, string> = { ',': t`Comma`, '\t': t`Tab`, ';': t`Semicolon` }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-x-hidden overflow-y-auto p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>
            <Trans>Map the columns</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Tell spendlook how to read “{fileName}”. This is saved for {account.name} and reused while the bank’s format stays the same.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary/8 p-3">
            <p className="max-w-md text-sm">
              {settings?.verified ? (
                <Trans>Let AI suggest the columns. Only the header and the first 3 rows are sent to {PROVIDER_LABEL[settings.provider]}.</Trans>
              ) : (
                <Trans>Set an AI key in Settings to get column suggestions, or map them yourself below.</Trans>
              )}
            </p>
            {settings?.verified && (
              <Button variant="outline" onClick={detect} disabled={ai === 'running' || noHeader}>
                {ai === 'running' ? <Loader2 className="animate-spin motion-reduce:animate-none" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
                <Trans>Detect with AI</Trans>
              </Button>
            )}
            {noHeader && (
              <p className="w-full text-sm text-muted-foreground">
                <Trans>First choose which row holds the column names below; nothing is sent until then.</Trans>
              </p>
            )}
            {ai === 'error' && (
              <p role="alert" className="w-full text-sm text-destructive">
                <Trans>AI could not suggest a mapping. Map the columns yourself, or try again.</Trans>
              </p>
            )}
          </div>

          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="kicker mb-2 text-muted-foreground">
              <Trans>File</Trans>
            </legend>
            <Field label={t`Encoding`}>
              <Picker label={t`Encoding`} value={encoding} onChange={(v) => reread({ encoding: v })} options={ENCODINGS.map((e) => ({ value: e, label: e }))} />
            </Field>
            <Field label={t`Separator`}>
              <Picker label={t`Separator`} value={delimiter} onChange={(v) => reread({ delimiter: v })} options={DELIMITERS.map((d) => ({ value: d, label: delimiterLabels[d] }))} />
            </Field>
            <Field label={t`Header row`}>
              <Picker label={t`Header row`} value={String(headerRow)} onChange={(v) => reread({ headerRow: Number(v) })} options={rowOptions} />
            </Field>
          </fieldset>

          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="kicker mb-2 text-muted-foreground">
              <Trans>Columns</Trans>
            </legend>
            <Field label={t`Date`} error={err('dateCol')}>
              <Picker label={t`Date column`} value={String(current.dateCol)} onChange={(v) => set({ dateCol: Number(v) })} options={columns} />
            </Field>
            <Field label={t`Date format`}>
              <Picker label={t`Date format`} value={current.dateFormat} onChange={(v) => set({ dateFormat: v })} options={DATE_FORMATS.map((f) => ({ value: f, label: dateLabels[f] }))} />
            </Field>
            <Field label={t`Time (optional)`} error={err('timeCol')}>
              <Picker
                label={t`Time column`}
                value={current.timeCol === undefined ? NONE : String(current.timeCol)}
                onChange={(v) => set({ timeCol: toCol(v) })}
                options={[{ value: NONE, label: t`None, or inside the date` }, ...columns]}
              />
            </Field>
            <Field label={t`Amount`} error={err('amount')}>
              <Picker
                label={t`Amount layout`}
                value={current.amount.mode}
                onChange={(mode) => set({ amount: mode === 'split' ? { mode, outCol: 0, inCol: 0 } : { mode, col: 0, negativeIs: 'expense' } })}
                options={[
                  { value: 'split', label: t`Separate money out / in columns` },
                  { value: 'signed', label: t`One column with + / −` },
                ]}
              />
            </Field>
            {current.amount.mode === 'split' ? (
              <>
                <Field label={t`Money out (debit)`}>
                  <Picker
                    label={t`Money out column`}
                    value={String(current.amount.outCol)}
                    onChange={(v) => current.amount.mode === 'split' && set({ amount: { ...current.amount, outCol: Number(v) } })}
                    options={columns}
                  />
                </Field>
                <Field label={t`Money in (credit)`}>
                  <Picker
                    label={t`Money in column`}
                    value={String(current.amount.inCol)}
                    onChange={(v) => current.amount.mode === 'split' && set({ amount: { ...current.amount, inCol: Number(v) } })}
                    options={columns}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label={t`Amount column`}>
                  <Picker
                    label={t`Amount column`}
                    value={String(current.amount.col)}
                    onChange={(v) => current.amount.mode === 'signed' && set({ amount: { ...current.amount, col: Number(v) } })}
                    options={columns}
                  />
                </Field>
                <Field label={t`Negative amounts are`}>
                  <Picker
                    label={t`Negative amounts are`}
                    value={current.amount.negativeIs}
                    onChange={(v) => current.amount.mode === 'signed' && set({ amount: { ...current.amount, negativeIs: v } })}
                    options={[
                      { value: 'expense', label: t`Money out` },
                      { value: 'income', label: t`Money in (card statements)` },
                    ]}
                  />
                </Field>
              </>
            )}
            <Field label={t`Balance (optional)`} error={err('balanceCol')}>
              <Picker label={t`Balance column`} value={current.balanceCol === undefined ? NONE : String(current.balanceCol)} onChange={(v) => set({ balanceCol: toCol(v) })} options={optional} />
            </Field>
            <Field label={t`Reference no. (optional)`} error={err('idCol')}>
              <Picker label={t`Reference column`} value={current.idCol === undefined ? NONE : String(current.idCol)} onChange={(v) => set({ idCol: toCol(v) })} options={optional} />
            </Field>
          </fieldset>

          <fieldset>
            <legend className="kicker mb-2 text-muted-foreground">
              <Trans>Merchant / description</Trans> {err('descriptionCols')}
            </legend>
            <p className="mb-2 text-xs text-muted-foreground">
              <Trans>Pick every column that names the shop or person. Banks often put it in a reference column.</Trans>
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {columns.map((c) => {
                const i = Number(c.value)
                const on = current.descriptionCols.includes(i)
                return (
                  <Label key={c.value} className="cursor-pointer font-normal">
                    <Checkbox
                      checked={on}
                      onCheckedChange={(v) => set({ descriptionCols: v ? [...current.descriptionCols, i].sort((a, b) => a - b) : current.descriptionCols.filter((x) => x !== i) })}
                    />
                    {c.label}
                  </Label>
                )
              })}
            </div>
          </fieldset>

          <section aria-live="polite">
            <h3 className="kicker mb-2 text-muted-foreground">
              <Trans>Preview</Trans>{' '}
              {all.length > 0 && (
                <span className="normal-case tracking-normal">
                  <Trans>· {all.length} transactions</Trans>
                </span>
              )}
            </h3>
            {parseError ? (
              <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                <Trans>A row could not be read with these settings: {parseError}</Trans>
              </p>
            ) : errors.length ? (
              <p className="text-sm text-muted-foreground">
                <Trans>Fix the highlighted columns to see a preview.</Trans>
              </p>
            ) : !all.length ? (
              <p className="text-sm text-muted-foreground">
                <Trans>No transactions found below the header row.</Trans>
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">
                        <Trans>Date</Trans>
                      </th>
                      <th className="px-3 py-2 font-medium">
                        <Trans>Merchant</Trans>
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        <Trans>Amount</Trans>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r) => (
                      <tr key={r.key} className="border-t">
                        <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">
                          {r.date}
                          {r.time && <span className="ml-1.5 text-muted-foreground">{r.time}</span>}
                        </td>
                        <td className="max-w-72 truncate px-3 py-1.5" title={r.rawMerchant}>
                          {r.rawMerchant}
                        </td>
                        <td className={`px-3 py-1.5 text-right whitespace-nowrap tabular-nums ${r.kind === 'income' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                          {r.kind === 'income' ? '+' : '−'}
                          {formatMoney(r.amount, account.currency, i18n.locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="sticky bottom-0 m-0 border-t bg-popover px-5 py-3">
          <Button variant="outline" onClick={onCancel}>
            <Trans>Cancel</Trans>
          </Button>
          <Button disabled={!canSave} onClick={() => onConfirm(current, all)}>
            <Trans>Save mapping and import {all.length}</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, error, children }: { label: string; error?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1 [&_[data-slot=select-trigger]]:w-full">
      <div className="flex items-center justify-between gap-2 text-sm font-medium">
        {label}
        {error}
      </div>
      {children}
    </div>
  )
}
