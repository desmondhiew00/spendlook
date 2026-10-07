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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Picker } from '@/components/picker'
import { exportBackup, importBackup } from '@/lib/backup'
import { BATCH_SIZE, aiGenerate, recategorizableMerchants, recategorizeAll } from '@/lib/categorize'
import { makeModel } from '@/lib/model'
import { type AiSettings, DEFAULT_MODEL, PROVIDER_LABEL, type Provider, loadSettings, saveSettings } from '@/lib/settings'

export function SettingsPage() {
  const { t } = useLingui()
  const initial = loadSettings()
  const [provider, setProvider] = useState<Provider>(initial?.provider ?? 'anthropic')
  const [model, setModel] = useState(initial?.model ?? DEFAULT_MODEL.anthropic)
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '')
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>(initial?.verified ? 'ok' : 'idle')
  const [error, setError] = useState('')
  const [backupMsg, setBackupMsg] = useState('')

  async function saveAndTest() {
    const s: AiSettings = { provider, model: model.trim(), apiKey: apiKey.trim(), verified: false }
    saveSettings(s)
    setStatus('testing')
    setError('')
    try {
      const r = await aiGenerate(makeModel(s))([{ id: 'test', name: 'セブン-イレブン', kind: 'expense' }])
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

  async function restore(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      await importBackup(await file.text())
      setBackupMsg(t`Backup restored.`)
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-4xl font-bold tracking-[-0.04em]"><Trans>Settings</Trans></h1>
      <Card>
        <CardHeader><CardTitle><Trans>AI categorization</Trans></CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label><Trans>Provider</Trans></Label>
            <Picker<Provider> label={t`Provider`} value={provider} onChange={(p) => { setProvider(p); setModel(DEFAULT_MODEL[p]); setStatus('idle') }} className="h-9 w-full" options={(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => ({ value: p, label: PROVIDER_LABEL[p] }))} />
          </div>
          <div className="space-y-2"><Label htmlFor="ai-model"><Trans>Model</Trans></Label><Input id="ai-model" value={model} onChange={(e) => { setModel(e.target.value); setStatus('idle') }} /></div>
          <div className="space-y-2"><Label htmlFor="ai-key"><Trans>API key</Trans></Label><Input id="ai-key" type="password" autoComplete="off" value={apiKey} onChange={(e) => { setApiKey(e.target.value); setStatus('idle') }} /></div>
          <p className="text-xs text-muted-foreground">
            <Trans>Stored only in this browser and sent only to {PROVIDER_LABEL[provider]}. Only merchant names are sent, never amounts or dates.</Trans>
          </p>
          <div className="flex items-center gap-3">
            <Button onClick={saveAndTest} disabled={!apiKey.trim() || !model.trim() || status === 'testing'}>
              {status === 'testing' ? <Trans>Testing…</Trans> : <Trans>Save & test key</Trans>}
            </Button>
            {status === 'ok' && <span className="text-sm text-emerald-600 dark:text-emerald-400"><Trans>Key works.</Trans></span>}
            {status === 'fail' && <span className="text-sm text-destructive"><Trans>Key test failed: {error}</Trans></span>}
          </div>
        </CardContent>
      </Card>
      <RecategorizeCard enabled={status === 'ok'} providerLabel={PROVIDER_LABEL[provider]} />
      <Card>
        <CardHeader>
          <CardTitle><Trans>Backup</Trans></CardTitle>
          <CardDescription><Trans>Your data lives only in this browser. Clearing site data or switching devices loses it, so export a backup regularly.</Trans></CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={download}><Trans>Export backup</Trans></Button>
          <label className={cn(buttonVariants({ variant: 'outline' }), 'cursor-pointer has-focus-visible:ring-3 has-focus-visible:ring-ring/50')}>
            <Trans>Import backup</Trans>
            <input type="file" accept="application/json,.json" className="sr-only" onChange={restore} />
          </label>
          {backupMsg && <span className="text-sm">{backupMsg}</span>}
        </CardContent>
      </Card>
    </div>
  )
}

// Re-runs the AI over every merchant it owns (e.g. after new categories ship). Counts first so the user
// sees what will be sent and roughly how many requests it costs before anything leaves the browser.
function RecategorizeCard({ enabled, providerLabel }: { enabled: boolean; providerLabel: string }) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState<number>()
  const [progress, setProgress] = useState<{ done: number; total: number }>()
  const [result, setResult] = useState('')
  const requests = Math.ceil((count ?? 0) / BATCH_SIZE)

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
      const r = await recategorizeAll(aiGenerate(makeModel(loadSettings()!)), undefined, (done, total) => setProgress({ done, total }))
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
                : <><Trans>{count} merchant names will be sent to {providerLabel}</Trans> (<Plural value={requests} one="about # request" other="about # requests" />). <Trans>Amounts and dates are never sent. Categories you picked yourself won't change.</Trans></>}
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
