import { Trans, useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { type ChangeEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const importErrorText: Record<ImportError['code'], string> = {
    wrong_type_paypay: t`This looks like a PayPay file, not MUFG.`,
    wrong_type_mufg: t`This looks like a MUFG file, not PayPay.`,
    unknown_format: t`Unrecognized file. Upload the CSV exported from MUFG or PayPay.`,
    bad_row: t`The file has a row that could not be read. Re-export the CSV and try again.`,
  }

  // never throws: import results must stay visible even when the AI step fails
  async function categorize() {
    try {
      const r = await categorizePending(aiGenerate(makeModel(settings!)))
      return r.failed ? t`${r.failed} merchants could not be categorized. Retry below.` : ''
    } catch (err) {
      console.error(err)
      return t`Categorizing failed. Check your AI key in Settings, then retry.`
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setMessage('')
    try {
      const rows = parseFile(await file.arrayBuffer(), account.type)
      const u = await importRows(account, file.name, rows)
      const summary = t`${u.added} added, ${u.skipped} skipped.`
      setMessage(`${summary} ${t`Categorizing…`}`)
      setMessage(`${summary} ${await categorize()}`)
    } catch (err) {
      setMessage(err instanceof ImportError ? importErrorText[err.code] : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function retry() {
    setBusy(true)
    try {
      setMessage((await categorize()) || t`All merchants categorized.`)
    } finally {
      setBusy(false)
    }
  }

  if (!settings?.verified) {
    return <p className="text-sm"><Trans>Set and test your AI key in <Link to="/settings" className="underline">Settings</Link> to upload.</Trans></p>
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className={`kicker bg-primary px-4 py-2.5 text-primary-foreground hover:bg-primary/85 ${busy ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
            <Trans>Upload {account.type === 'mufg' ? 'MUFG' : 'PayPay'} CSV</Trans>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} disabled={busy} />
          </label>
          {!!pending && (
            <Button variant="outline" size="sm" onClick={retry} disabled={busy}><Trans>Retry categorize ({pending})</Trans></Button>
          )}
          {message && <span role="status" className="text-sm">{message}</span>}
        </div>
        {!!uploads?.length && (
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground"><Trans>Upload history ({uploads.length})</Trans></summary>
            <ul className="mt-2 space-y-1 text-sm">
              {uploads.map((u) => (
                <li key={u.id} className="flex items-center gap-3">
                  <span className="tabular-nums">{new Date(u.createdAt).toLocaleString(i18n.locale)}</span>
                  <span className="truncate">{u.fileName}</span>
                  <span className="text-muted-foreground"><Trans>{u.added} added, {u.skipped} skipped</Trans></span>
                  <Button variant="ghost" size="sm" onClick={() => confirm(t`Delete the transactions from this upload?`) && deleteUpload(u.id)}><Trans>Delete</Trans></Button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  )
}
