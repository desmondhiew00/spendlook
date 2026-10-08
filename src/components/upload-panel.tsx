import { Trans, useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { cn } from 'cn'
import { Columns3, FileUp, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react'
import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { ConfirmDelete } from '@/components/confirm-delete'
import { MappingDialog } from '@/components/mapping-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { currentAiRun, trackAiRun, useAiRun } from '@/lib/ai-run'
import { categorizePending, pendingMerchants } from '@/lib/categorize'
import { carryOver, type MappingBase } from '@/lib/custom/ai'
import { clean, headerMatches, parseCustom } from '@/lib/custom/parse'
import { readRows, sniff } from '@/lib/custom/sniff'
import { fractionDigits } from '@/lib/custom/values'
import { db } from '@/lib/db'
import { deleteUpload, importRows } from '@/lib/importer'
import { ImportError, parseFile } from '@/lib/parse'
import { loadSettings } from '@/lib/settings'
import type { Account, CustomMapping, ParsedRow } from '@/lib/types'
import { aiFor } from '@/lib/usage'

export function UploadPanel({ account }: { account: Account }) {
  const { t, i18n } = useLingui()
  const settings = loadSettings()
  const ai = !!settings?.verified // AI is opt-in: without a key, merchants import uncategorized for the user to sort
  const uploads = useLiveQuery(() => db.uploads.where('accountId').equals(account.id).reverse().sortBy('createdAt'), [account.id])
  const pending = useLiveQuery(() => pendingMerchants().then((p) => p.length), [])
  // import is this page's; the AI run is global (it outlives the page). Either blocks a second upload mid-flight;
  // a re-categorize from Settings doesn't block uploads, its new merchants just wait for Retry
  const [importing, setImporting] = useState(false)
  const aiRun = useAiRun()
  const work = aiRun?.job === 'categorize' ? { step: 'categorize' as const, ...aiRun } : importing ? { step: 'import' as const } : null
  const busy = work !== null
  const [message, setMessage] = useState('')
  // shown with the no-key upload message only: the moment a user faces sorting merchants by hand
  const [keyHint, setKeyHint] = useState(false)
  const [dragging, setDragging] = useState(false)
  const uploadRef = useRef<(file: File) => void>(null)
  // custom CSV whose columns still need confirming (first upload, or the bank changed its export format)
  const [mappingFor, setMappingFor] = useState<{ fileName: string; bytes: ArrayBuffer; initial: MappingBase; initialMapping?: CustomMapping } | null>(null)
  const sourceLabel = account.type === 'mufg' ? 'MUFG' : account.type === 'paypay' ? 'PayPay' : ''

  // drop a CSV anywhere on the page; the depth counter stops flicker when dragging across child elements
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (hasFiles(e)) {
        depth++
        setDragging(true)
      }
    }
    const leave = (e: DragEvent) => {
      if (hasFiles(e) && --depth <= 0) {
        depth = 0
        setDragging(false)
      }
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const file = e.dataTransfer?.files[0]
      if (file) uploadRef.current?.(file)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])

  const importErrorText: Record<ImportError['code'], string> = {
    wrong_type_paypay: t`This looks like a PayPay file, not MUFG.`,
    wrong_type_mufg: t`This looks like a MUFG file, not PayPay.`,
    unknown_format: t`Unrecognized file. Upload the CSV exported from MUFG or PayPay.`,
    bad_row: t`The file has a row that could not be read. Re-export the CSV and try again.`,
  }

  // never throws: import results must stay visible even when the AI step fails
  async function categorize() {
    if (!ai) {
      setKeyHint(true)
      return t`New merchants are marked for review: pick their categories below.`
    }
    if (currentAiRun()) return '' // a re-categorize started meanwhile; new merchants stay pending, Retry picks them up
    try {
      const r = await trackAiRun('categorize', (onProgress) => categorizePending(aiFor(settings!, 'categorize'), undefined, onProgress))
      return r.failed ? t`${r.failed} merchants could not be categorized. Retry below.` : ''
    } catch (err) {
      console.error(err)
      return t`Categorizing failed. Check your AI key in Settings, then retry.`
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) await upload(file)
  }

  async function upload(file: File) {
    if (busy || mappingFor) return // a drop behind the open mapping dialog must not swap its file
    setImporting(true)
    setMessage('')
    setKeyHint(false)
    try {
      const bytes = await file.arrayBuffer()
      if (account.type === 'custom') {
        const rows = account.mapping && readRows(bytes, account.mapping.encoding, account.mapping.delimiter)
        if (!account.mapping || !rows || !headerMatches(rows, account.mapping)) {
          const s = sniff(bytes)
          const initial = { encoding: s.encoding, delimiter: s.delimiter, headerRow: s.headerRow, header: (s.rows[s.headerRow] ?? []).map(clean) }
          // header changed: keep the user's earlier column picks wherever those columns still exist
          setMappingFor({ fileName: file.name, bytes, initial, initialMapping: (account.mapping && carryOver(account.mapping, initial)) ?? undefined })
          return
        }
        await importAndCategorize(file.name, parseCustomOrBadRow(rows, account.mapping))
        return
      }
      await importAndCategorize(file.name, parseFile(bytes, account.type))
    } catch (err) {
      setMessage(err instanceof ImportError ? importErrorText[err.code] : String(err))
    } finally {
      setImporting(false)
    }
  }

  function parseCustomOrBadRow(rows: string[][], m: CustomMapping) {
    try {
      return parseCustom(rows, m, fractionDigits(account.currency))
    } catch {
      console.error('bad row') // not the error: its message quotes the cell
      throw new ImportError('bad_row')
    }
  }

  async function importAndCategorize(fileName: string, rows: ParsedRow[]) {
    const u = await importRows(account, fileName, rows)
    const summary = t`${u.added} added, ${u.skipped} skipped.`
    setMessage(summary)
    setMessage(`${summary} ${await categorize()}`)
  }

  async function confirmMapping(mapping: CustomMapping, rows: ParsedRow[]) {
    const fileName = mappingFor!.fileName
    setMappingFor(null)
    setImporting(true)
    try {
      await db.accounts.update(account.id, { mapping })
      await importAndCategorize(fileName, rows)
    } catch (err) {
      setMessage(String(err))
    } finally {
      setImporting(false)
    }
  }

  // drop handler below is registered once; keep it pointed at the latest upload()
  useEffect(() => {
    uploadRef.current = upload
  })

  async function retry() {
    setMessage((await categorize()) || t`All merchants categorized.`)
  }

  // compact toolbar for the page header; history lives in a modal so it never pushes the dashboard down
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {ai && !!pending && !busy && !aiRun && (
          <Button variant="outline" size="lg" onClick={retry}>
            <RefreshCw data-icon="inline-start" />
            <Trans>Retry categorize ({pending})</Trans>
          </Button>
        )}
        {account.type === 'custom' && account.mapping && !busy && (
          <ConfirmDelete
            trigger={
              <Button variant="outline" size="lg">
                <Columns3 data-icon="inline-start" />
                <Trans>Reset columns</Trans>
              </Button>
            }
            title={<Trans>Reset the column mapping?</Trans>}
            description={<Trans>Your next upload will ask you to map the columns again. Imported transactions are kept.</Trans>}
            confirmLabel={<Trans>Reset columns</Trans>}
            onConfirm={() => db.accounts.update(account.id, { mapping: undefined })}
          />
        )}
        {!!uploads?.length && (
          <Dialog>
            <DialogTrigger
              render={
                <Button variant="link" size="lg" className="px-2">
                  <Trans>History ({uploads.length})</Trans>
                </Button>
              }
            />
            <DialogContent className="gap-0 p-0 sm:max-w-lg">
              <DialogHeader className="border-b px-4 py-3">
                <DialogTitle>
                  <Trans>Upload history</Trans>
                </DialogTitle>
              </DialogHeader>
              <ul className="max-h-[60vh] divide-y overflow-y-auto">
                {uploads.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium" title={u.fileName}>
                        {u.fileName}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {new Date(u.createdAt).toLocaleString(i18n.locale)} ·{' '}
                        <Trans>
                          {u.added} added, {u.skipped} skipped
                        </Trans>
                      </div>
                    </div>
                    <ConfirmDelete
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t`Delete the transactions from this upload`}
                          title={t`Delete the transactions from this upload`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 />
                        </Button>
                      }
                      title={<Trans>Delete this upload?</Trans>}
                      description={
                        <Trans>
                          The {u.added} transactions imported from “{u.fileName}” will be removed. Other uploads are not affected, and you can re-upload the file later.
                        </Trans>
                      }
                      confirmLabel={<Trans>Delete upload</Trans>}
                      onConfirm={() => deleteUpload(u.id)}
                    />
                  </li>
                ))}
              </ul>
            </DialogContent>
          </Dialog>
        )}
        <label className={cn(buttonVariants({ size: 'lg' }), 'has-focus-visible:ring-3 has-focus-visible:ring-ring/50', busy ? 'pointer-events-none opacity-80' : 'cursor-pointer')}>
          {work ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Upload />}
          {!work ? (
            sourceLabel ? (
              <Trans>Upload {sourceLabel} CSV</Trans>
            ) : (
              <Trans>Upload CSV</Trans>
            )
          ) : work.step === 'import' ? (
            <Trans>Importing…</Trans>
          ) : (
            <Trans>
              Categorizing {work.done}/{work.total}…
            </Trans>
          )}
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} disabled={busy} />
        </label>
      </div>
      {dragging && !busy && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/80 p-6 backdrop-blur-sm">
          <div className="flex size-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary text-center">
            <FileUp className="size-10 text-primary" />
            <div className="text-2xl font-bold tracking-tight">
              <Trans>Drop to upload to {account.name}</Trans>
            </div>
            <div className="kicker text-muted-foreground">{sourceLabel} CSV</div>
          </div>
        </div>
      )}
      {mappingFor && (
        <MappingDialog
          account={account}
          {...mappingFor}
          onCancel={() => {
            setMappingFor(null)
            setMessage(t`Upload cancelled.`)
          }}
          onConfirm={confirmMapping}
        />
      )}
      {/* aria-busy + live status so screen readers hear progress too */}
      <span role="status" aria-busy={busy} className="max-w-md text-right text-sm text-muted-foreground empty:hidden">
        {work?.step === 'categorize' ? (
          <>
            {message} <Trans>AI is categorizing new merchants — you can keep browsing.</Trans>
          </>
        ) : (
          message
        )}
        {keyHint && (
          <>
            {' '}
            <Trans>
              Or add an AI key in{' '}
              <Link to="/settings" className="underline hover:text-foreground">
                Settings
              </Link>{' '}
              to categorize them automatically.
            </Trans>
          </>
        )}
      </span>
    </div>
  )
}
