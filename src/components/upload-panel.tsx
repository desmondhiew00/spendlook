import { Trans, useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { cn } from 'cn'
import { FileUp, History, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react'
import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { ConfirmDelete } from '@/components/confirm-delete'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { aiGenerate, categorizePending, pendingMerchants } from '@/lib/categorize'
import { db } from '@/lib/db'
import { deleteUpload, importRows } from '@/lib/importer'
import { makeModel } from '@/lib/model'
import { ImportError, parseFile } from '@/lib/parse'
import { loadSettings } from '@/lib/settings'
import type { Account } from '@/lib/types'

export function UploadPanel({ account }: { account: Account }) {
  const { t, i18n } = useLingui()
  const settings = loadSettings()
  const uploads = useLiveQuery(() => db.uploads.where('accountId').equals(account.id).reverse().sortBy('createdAt'), [account.id])
  const pending = useLiveQuery(() => pendingMerchants().then((p) => p.length), [])
  // what's running right now; drives the spinner label and blocks a second import mid-flight
  const [work, setWork] = useState<{ step: 'import' } | { step: 'categorize'; done: number; total: number } | null>(null)
  const busy = work !== null
  const [message, setMessage] = useState('')
  const [dragging, setDragging] = useState(false)
  const uploadRef = useRef<(file: File) => void>(null)

  // drop a CSV anywhere on the page; the depth counter stops flicker when dragging across child elements
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => { if (hasFiles(e)) { depth++; setDragging(true) } }
    const leave = (e: DragEvent) => { if (hasFiles(e) && --depth <= 0) { depth = 0; setDragging(false) } }
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault() }
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
    try {
      const r = await categorizePending(aiGenerate(makeModel(settings!)), undefined, (done, total) => setWork({ step: 'categorize', done, total }))
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
    if (busy) return
    setWork({ step: 'import' })
    setMessage('')
    try {
      const rows = parseFile(await file.arrayBuffer(), account.type)
      const u = await importRows(account, file.name, rows)
      const summary = t`${u.added} added, ${u.skipped} skipped.`
      setMessage(summary)
      setMessage(`${summary} ${await categorize()}`)
    } catch (err) {
      setMessage(err instanceof ImportError ? importErrorText[err.code] : String(err))
    } finally {
      setWork(null)
    }
  }

  // drop handler below is registered once; keep it pointed at the latest upload()
  useEffect(() => {
    uploadRef.current = upload
  })

  async function retry() {
    setWork({ step: 'categorize', done: 0, total: pending ?? 0 })
    try {
      setMessage((await categorize()) || t`All merchants categorized.`)
    } finally {
      setWork(null)
    }
  }

  if (!settings?.verified) {
    return <p className="text-sm text-muted-foreground"><Trans>Set and test your AI key in <Link to="/settings" className="underline">Settings</Link> to upload.</Trans></p>
  }

  // compact toolbar for the page header; history lives in a modal so it never pushes the dashboard down
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!!pending && !busy && (
          <Button variant="outline" size="lg" onClick={retry}><RefreshCw data-icon="inline-start" /><Trans>Retry categorize ({pending})</Trans></Button>
        )}
        {!!uploads?.length && (
          <Dialog>
            <DialogTrigger render={<Button variant="outline" size="lg"><History data-icon="inline-start" /><Trans>History ({uploads.length})</Trans></Button>} />
            <DialogContent className="gap-0 p-0 sm:max-w-lg">
              <DialogHeader className="border-b px-4 py-3">
                <DialogTitle className="kicker text-primary"><Trans>Upload history</Trans></DialogTitle>
              </DialogHeader>
              <ul className="max-h-[60vh] divide-y overflow-y-auto">
                {uploads.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium" title={u.fileName}>{u.fileName}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {new Date(u.createdAt).toLocaleString(i18n.locale)} · <Trans>{u.added} added, {u.skipped} skipped</Trans>
                      </div>
                    </div>
                    <ConfirmDelete
                      trigger={<Button variant="ghost" size="icon-sm" aria-label={t`Delete the transactions from this upload`} title={t`Delete the transactions from this upload`} className="text-muted-foreground hover:text-destructive"><Trash2 /></Button>}
                      title={<Trans>Delete this upload?</Trans>}
                      description={<Trans>The {u.added} transactions imported from “{u.fileName}” will be removed. Other uploads are not affected, and you can re-upload the file later.</Trans>}
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
          {!work ? <Trans>Upload {account.type === 'mufg' ? 'MUFG' : 'PayPay'} CSV</Trans>
            : work.step === 'import' ? <Trans>Importing…</Trans>
            : <Trans>Categorizing {work.done}/{work.total}…</Trans>}
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} disabled={busy} />
        </label>
      </div>
      {dragging && !busy && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/80 p-6 backdrop-blur-sm">
          <div className="flex size-full flex-col items-center justify-center gap-3 border-2 border-dashed border-primary text-center">
            <FileUp className="size-10 text-primary" />
            <div className="text-2xl font-bold tracking-tight"><Trans>Drop to upload to {account.name}</Trans></div>
            <div className="kicker text-muted-foreground"><Trans>{account.type === 'mufg' ? 'MUFG' : 'PayPay'} CSV</Trans></div>
          </div>
        </div>
      )}
      {/* aria-busy + live status so screen readers hear progress too */}
      <span role="status" aria-busy={busy} className="max-w-md text-right text-sm text-muted-foreground empty:hidden">
        {work?.step === 'categorize' ? <>{message} <Trans>AI is categorizing new merchants — you can keep browsing.</Trans></> : message}
      </span>

    </div>
  )
}
