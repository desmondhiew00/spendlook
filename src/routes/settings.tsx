import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { type ChangeEvent, useState } from 'react'
import { cn } from 'cn'
import { Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModelInput } from '@/components/model-input'
import { Picker } from '@/components/picker'
import { PassphraseNeeded, changePassphrase, deleteAllData, disableEncryption, enableEncryption, exportBackup, importBackup } from '@/lib/backup'
import { isEnabled, setMaster } from '@/lib/vault'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { BATCH_SIZE, recategorizableMerchants, recategorizeAll } from '@/lib/categorize'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { type AiSettings, DEFAULT_MODEL, PROVIDER_LABEL, type Provider, clearAi, keyMatches, loadKey, loadSettings, saveKey, saveSettings } from '@/lib/settings'
import { aiFor, estimate, loadPrices, savePrice, summarize } from '@/lib/usage'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function SettingsPage() {
  const { t } = useLingui()
  const initial = loadSettings()
  const [provider, setProvider] = useState<Provider>(initial?.provider ?? 'anthropic')
  const [model, setModel] = useState(initial?.model ?? DEFAULT_MODEL.anthropic)
  const [apiKey, setApiKey] = useState(() => loadKey(initial?.provider ?? 'anthropic'))
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>(initial?.verified ? 'ok' : 'idle')
  const [error, setError] = useState('')
  // explicit consent before any data is sent; a key that already works was consented to when it was saved
  const [consent, setConsent] = useState(!!initial?.verified)
  const [backupMsg, setBackupMsg] = useState('')
  // a key in another provider's format is never sent (e.g. an Anthropic key left in the box after switching)
  const keyOk = keyMatches(provider, apiKey)

  async function saveAndTest() {
    const s: AiSettings = { provider, model: model.trim(), apiKey: apiKey.trim(), verified: false }
    saveSettings(s)
    saveKey(provider, s.apiKey)
    setStatus('testing')
    setError('')
    try {
      const r = await aiFor(s, 'test')([{ id: 'test', name: 'セブン-イレブン', kind: 'expense' }])
      if (!r.length) throw new Error('Empty response')
      saveSettings({ ...s, verified: true })
      setStatus('ok')
    } catch (e) {
      setStatus('fail')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function download() {
    const url = URL.createObjectURL(new Blob([await exportBackup()], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `spendlook-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // an encrypted backup asks for its passphrase, then retries with the same file
  const [sealedFile, setSealedFile] = useState<string>()
  const [backupPass, setBackupPass] = useState('')

  async function restore(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) await tryRestore(await file.text())
  }

  async function tryRestore(json: string, passphrase?: string) {
    setBackupMsg('')
    try {
      await importBackup(json, passphrase)
      setSealedFile(undefined)
      setBackupPass('')
      setBackupMsg(t`Backup restored.`)
    } catch (err) {
      if (err instanceof PassphraseNeeded) setSealedFile(json)
      setBackupMsg(err instanceof PassphraseNeeded ? (passphrase ? t`Wrong passphrase for this backup.` : t`This backup is encrypted. Enter its passphrase.`) : err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold tracking-[-0.04em]"><Trans>Settings</Trans></h1>
      {/* two groups: side by side on wide screens, AI first when stacked. AI-only cards appear once AI is on. */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="settings-ai" className="space-y-4">
          <h2 id="settings-ai" className="kicker text-muted-foreground"><Trans>AI categorization</Trans></h2>
          <Card>
            <CardHeader><CardTitle><Trans>Provider and key</Trans></CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label><Trans>Provider</Trans></Label>
                <Picker<Provider> label={t`Provider`} value={provider} onChange={(p) => { setProvider(p); setModel(DEFAULT_MODEL[p]); setApiKey(loadKey(p)); setStatus('idle') }} className="h-9 w-full" options={(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => ({ value: p, label: PROVIDER_LABEL[p] }))} />
              </div>
              <div className="space-y-2"><Label htmlFor="ai-model"><Trans>Model</Trans></Label><ModelInput id="ai-model" provider={provider} value={model} onChange={(v) => { setModel(v); setStatus('idle') }} /></div>
              <div className="space-y-2"><Label htmlFor="ai-key"><Trans>API key</Trans></Label><Input id="ai-key" type="password" autoComplete="off" value={apiKey} onChange={(e) => { setApiKey(e.target.value); setStatus('idle') }} />{apiKey.trim() && !keyOk && <p className="text-xs text-destructive"><Trans>This doesn't look like a {PROVIDER_LABEL[provider]} key, so it won't be sent.</Trans></p>}</div>
              <p className="text-xs text-muted-foreground">
                <Trans>Optional. Without a key nothing leaves this browser and you pick categories yourself. With a key, it is stored only in this browser and sent only to {PROVIDER_LABEL[provider]}.</Trans>
              </p>
              <div className="space-y-1 border p-3 text-xs">
                <p className="font-medium"><Trans>What is sent to {PROVIDER_LABEL[provider]}</Trans></p>
                <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                  <li><Trans>Merchant names and whether each is spending or income. Never amounts, dates, balances or account numbers.</Trans></li>
                  <li><Trans>Transfers to or from people are never sent, so their names stay here.</Trans></li>
                  <li><Trans>For a custom CSV: the column names and the shape of 3 rows (every digit becomes 0, every word x).</Trans></li>
                </ul>
                <p className="text-muted-foreground"><Trans>The provider's own terms decide how long it keeps requests.</Trans></p>
                {provider === 'google' && (
                  <p className="text-amber-700 dark:text-amber-400">
                    <Trans>Gemini free tier: Google may use what you send to improve its products, and people may review it. Use a key from a billed project to avoid this. <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer" className="underline">Gemini API terms</a></Trans>
                  </p>
                )}
              </div>
              <Label className="cursor-pointer text-sm font-normal">
                <Checkbox checked={consent} onCheckedChange={(v) => { setConsent(!!v); setStatus('idle') }} />
                <Trans>I agree to send this to {PROVIDER_LABEL[provider]}.</Trans>
              </Label>
              <div className="flex items-center gap-3">
                <Button onClick={saveAndTest} disabled={!consent || !keyOk || !model.trim() || status === 'testing'}>
                  {status === 'testing' ? <Trans>Testing…</Trans> : <Trans>Save & test key</Trans>}
                </Button>
                {status === 'ok' && <span className="text-sm text-emerald-600 dark:text-emerald-400"><Trans>Key works.</Trans></span>}
                {status === 'fail' && <span className="text-sm text-destructive"><Trans>Key test failed: {error}</Trans></span>}
                {status === 'ok' && (
                  <Button variant="ghost" className="ml-auto" onClick={() => { clearAi(); setApiKey(''); setConsent(false); setStatus('idle') }}><Trans>Turn off AI</Trans></Button>
                )}
              </div>
            </CardContent>
          </Card>
          {status === 'ok' && <RecategorizeCard enabled providerLabel={PROVIDER_LABEL[provider]} model={model.trim()} />}
          <UsageCard model={model.trim()} />
        </section>
        <section aria-labelledby="settings-data" className="space-y-4">
          <h2 id="settings-data" className="kicker text-muted-foreground"><Trans>Your data</Trans></h2>
          <EncryptionCard />
          <Card>
            <CardHeader>
              <CardTitle><Trans>Backup</Trans></CardTitle>
              <CardDescription><Trans>Your data lives only in this browser. Clearing site data or switching devices loses it, so export a backup regularly. With encryption on, the backup file is encrypted with your passphrase; otherwise it is plain text, so keep it somewhere safe.</Trans></CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={download}><Trans>Export backup</Trans></Button>
              <label className={cn(buttonVariants({ variant: 'outline' }), 'cursor-pointer has-focus-visible:ring-3 has-focus-visible:ring-ring/50')}>
                <Trans>Import backup</Trans>
                <input type="file" accept="application/json,.json" className="sr-only" onChange={restore} />
              </label>
              {backupMsg && <span className="text-sm">{backupMsg}</span>}
              {sealedFile && (
                <form className="flex w-full gap-2" onSubmit={(e) => { e.preventDefault(); tryRestore(sealedFile, backupPass) }}>
                  <Input type="password" aria-label={t`Backup passphrase`} placeholder={t`Backup passphrase`} autoComplete="off" value={backupPass} onChange={(e) => setBackupPass(e.target.value)} />
                  <Button type="submit" disabled={!backupPass}><Trans>Restore</Trans></Button>
                </form>
              )}
            </CardContent>
          </Card>
          <DeleteAllCard onExport={download} />
        </section>
      </div>
    </div>
  )
}

const MIN_PASSPHRASE = 10

// Passphrase lock for everything stored in this browser (database and AI keys)
function EncryptionCard() {
  const { t } = useLingui()
  const [on, setOn] = useState(isEnabled)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const valid = next.length >= MIN_PASSPHRASE && next === confirm
  const reset = () => { setCurrent(''); setNext(''); setConfirm('') }

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true)
    setMsg('')
    try {
      await action()
      reset()
      setOn(isEnabled())
      setMsg(done)
    } catch (e) {
      // a failed GCM unwrap means the passphrase was wrong; anything else is shown as is
      setMsg(e instanceof Error && /tag|invalid/i.test(e.message) ? t`Wrong passphrase.` : e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const field = (id: string, label: string, value: string, set: (v: string) => void, autoComplete: string) => (
    <div className="space-y-1"><Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label><Input id={id} type="password" autoComplete={autoComplete} value={value} onChange={(e) => set(e.target.value)} /></div>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle><Trans>Encryption</Trans></CardTitle>
        <CardDescription>
          {on
            ? <Trans>On. Everything in this browser, including your AI keys, is encrypted with your passphrase. It is asked for each time the app opens.</Trans>
            : <Trans>Lock everything stored in this browser, including your AI keys, with a passphrase. Protects your data if someone copies this browser's files or uses this device. If you forget the passphrase, the data cannot be recovered by anyone.</Trans>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!on ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => enableEncryption(next), t`Encryption is on.`) }}>
            {field('enc-new', t`Passphrase (at least ${MIN_PASSPHRASE} characters)`, next, setNext, 'new-password')}
            {field('enc-confirm', t`Repeat passphrase`, confirm, setConfirm, 'new-password')}
            {confirm && next !== confirm && <p className="text-xs text-destructive"><Trans>The passphrases don't match.</Trans></p>}
            <Button type="submit" disabled={busy || !valid}>{busy && <Loader2 className="animate-spin motion-reduce:animate-none" data-icon="inline-start" />}<Trans>Turn on encryption</Trans></Button>
          </form>
        ) : (
          <>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => changePassphrase(current, next), t`Passphrase changed.`) }}>
              {field('enc-current', t`Current passphrase`, current, setCurrent, 'current-password')}
              {field('enc-new', t`New passphrase (at least ${MIN_PASSPHRASE} characters)`, next, setNext, 'new-password')}
              {field('enc-confirm', t`Repeat new passphrase`, confirm, setConfirm, 'new-password')}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || !current || !valid}><Trans>Change passphrase</Trans></Button>
                <Button type="button" variant="outline" onClick={() => location.reload()}><Trans>Lock now</Trans></Button>
                <Button type="button" variant="ghost" disabled={busy || !current} onClick={() => run(() => disableEncryption(current), t`Encryption is off.`)}><Trans>Turn off (needs current passphrase)</Trans></Button>
              </div>
            </form>
          </>
        )}
        {msg && <p role="status" className="text-sm">{msg}</p>}
      </CardContent>
    </Card>
  )
}

// Irreversible, so it takes a typed confirmation, offers a last-chance export, and reloads into a clean app
function DeleteAllCard({ onExport }: { onExport: () => void }) {
  const { t } = useLingui()
  const word = t`delete`
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  async function wipe() {
    setBusy(true)
    await deleteAllData()
    setMaster(null)
    try {
      localStorage.clear() // AI keys, settings, prices, language, theme; the storage is this site's alone
    } catch {}
    location.assign('/')
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive"><Trans>Delete all data</Trans></CardTitle>
        <CardDescription><Trans>Removes every account, transaction, merchant, category choice, AI usage log, and your saved AI keys and settings from this browser. This cannot be undone.</Trans></CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog onOpenChange={(open) => !open && setTyped('')}>
          <DialogTrigger render={<Button variant="destructive"><Trans>Delete all data…</Trans></Button>} />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle><Trans>Delete everything?</Trans></DialogTitle>
              <DialogDescription><Trans>All spendlook data in this browser will be erased, including your AI keys. Export a backup first if you might need it.</Trans></DialogDescription>
            </DialogHeader>
            <Button variant="outline" onClick={onExport}><Trans>Export backup first</Trans></Button>
            <Label htmlFor="confirm-delete-all" className="font-normal"><Trans>Type “{word}” to confirm</Trans></Label>
            <Input id="confirm-delete-all" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            <DialogFooter>
              <Button onClick={wipe} disabled={busy || typed.trim().toLowerCase() !== word} className="bg-destructive text-white hover:bg-destructive/90">
                {busy && <Loader2 className="animate-spin motion-reduce:animate-none" data-icon="inline-start" />}
                <Trans>Delete all data</Trans>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

// Re-runs the AI over every merchant it owns (e.g. after new categories ship). Counts first so the user
// sees what will be sent and roughly how many requests it costs before anything leaves the browser.
function RecategorizeCard({ enabled, providerLabel, model }: { enabled: boolean; providerLabel: string; model: string }) {
  const { t, i18n } = useLingui()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState<number>()
  const [progress, setProgress] = useState<{ done: number; total: number }>()
  const [result, setResult] = useState('')
  const requests = Math.ceil((count ?? 0) / BATCH_SIZE)
  const usage = useLiveQuery(() => db.usage.toArray(), [])
  const est = count && usage ? estimate(usage, count, loadPrices()[model]) : undefined

  async function prepare() {
    setCount(undefined)
    setOpen(true)
    setCount((await recategorizableMerchants()).length)
  }

  async function run() {
    setOpen(false)
    setResult('')
    setProgress({ done: 0, total: count ?? 0 })
    try {
      const r = await recategorizeAll(aiFor(loadSettings()!, 'recategorize'), undefined, (done, total) => setProgress({ done, total }))
      setResult(r.failed ? t`${r.done} re-categorized. ${r.failed} failed and kept their previous category, flagged for review.` : t`${r.done} merchants re-categorized.`)
    } catch (e) {
      setResult(e instanceof Error ? e.message : String(e))
    } finally {
      setProgress(undefined)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle><Trans>Re-categorize</Trans></CardTitle>
        <CardDescription><Trans>Run the AI again on every merchant, for example after new categories are added. Categories you picked yourself are never changed.</Trans></CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={prepare} disabled={!enabled || !!progress}>
          {progress ? <><Loader2 className="animate-spin motion-reduce:animate-none" /><Trans>Re-categorizing {progress.done}/{progress.total}…</Trans></> : <Trans>Re-categorize all</Trans>}
        </Button>
        {!enabled && <span className="text-sm text-muted-foreground"><Trans>Save and test a key first.</Trans></span>}
        {result && <span role="status" className="text-sm">{result}</span>}
      </CardContent>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle><Trans>Re-categorize all merchants?</Trans></AlertDialogTitle>
            <AlertDialogDescription>
              {count === undefined ? <Trans>Counting merchants…</Trans>
                : count === 0 ? <Trans>Nothing to re-categorize yet. Upload a CSV first.</Trans>
                : <><Trans>{count} merchant names will be sent to {providerLabel}</Trans> (<Plural value={requests} one="about # request" other="about # requests" />). <Trans>Amounts and dates are never sent. Categories you picked yourself won't change.</Trans>{est !== undefined && <> <Trans>Estimated cost: {usd(est, i18n.locale)}.</Trans></>}</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel autoFocus><Trans>Cancel</Trans></AlertDialogCancel>
            <Button onClick={run} disabled={!count}><Trans>Re-categorize</Trans></Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

// tiny amounts need more than 2 decimals to be meaningful ($0.0021, not $0.00)
const usd = (n: number, locale: string) => n.toLocaleString(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: n < 1 ? 4 : 2 })

function UsageCard({ model }: { model: string }) {
  const { t, i18n } = useLingui()
  const rows = useLiveQuery(() => db.usage.toArray(), [])
  const [prices, setPrices] = useState(loadPrices)
  const [monthStart] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime() })
  if (!rows?.length) return null // never used AI: nothing to show
  const periods = [
    { label: t`This month`, s: summarize(rows.filter((r) => r.at >= monthStart), prices) },
    { label: t`All time`, s: summarize(rows, prices) },
  ]
  const price = prices[model] ?? { input: 0, output: 0 }
  const setPrice = (k: 'input' | 'output', v: string) => {
    const next = { ...price, [k]: Math.max(0, Number(v) || 0) }
    savePrice(model, next)
    setPrices(loadPrices())
  }
  const num = (n: number) => n.toLocaleString(i18n.locale)
  const unpriced = periods[1].s.unpriced

  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle><Trans>AI usage</Trans></CardTitle>
        <CardDescription><Trans>Token counts are reported by the provider. Cost is an estimate from the prices below; your provider's billing page is the source of truth.</Trans></CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-0">
        <Table className="border-t [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead className="text-right"><Trans>Requests</Trans></TableHead>
              <TableHead className="text-right"><Trans>Input tokens</Trans></TableHead>
              <TableHead className="text-right"><Trans>Output tokens</Trans></TableHead>
              <TableHead className="text-right"><Trans>Est. cost</Trans></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.map(({ label, s }) => (
              <TableRow key={label}>
                <TableCell className="text-muted-foreground">{label}</TableCell>
                <TableCell className="text-right tabular-nums">{num(s.requests)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(s.inputTokens)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(s.outputTokens)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{usd(s.cost, i18n.locale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="space-y-2 px-4 pb-4">
          <div className="text-sm font-medium"><Trans>Price for {model} (USD per 1M tokens)</Trans></div>
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1"><Label htmlFor="price-in" className="text-xs text-muted-foreground"><Trans>Input</Trans></Label><Input id="price-in" type="number" min="0" step="0.01" value={price.input} onChange={(e) => setPrice('input', e.target.value)} className="w-28" /></div>
            <div className="space-y-1"><Label htmlFor="price-out" className="text-xs text-muted-foreground"><Trans>Output</Trans></Label><Input id="price-out" type="number" min="0" step="0.01" value={price.output} onChange={(e) => setPrice('output', e.target.value)} className="w-28" /></div>
          </div>
          {unpriced > 0 && <p className="text-xs text-muted-foreground"><Trans>{unpriced} requests used a model with no price set and are not in the cost.</Trans></p>}
        </div>
      </CardContent>
    </Card>
  )
}
