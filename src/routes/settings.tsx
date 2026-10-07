import { Trans, useLingui } from '@lingui/react/macro'
import { type ChangeEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { exportBackup, importBackup } from '@/lib/backup'
import { aiGenerate } from '@/lib/categorize'
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
          <label className="block text-sm">
            <Trans>Provider</Trans>
            <select value={provider} onChange={(e) => { const p = e.target.value as Provider; setProvider(p); setModel(DEFAULT_MODEL[p]); setStatus('idle') }} className="mt-1 block h-9 w-full rounded-md border bg-background px-2">
              {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>)}
            </select>
          </label>
          <label className="block text-sm"><Trans>Model</Trans><Input value={model} onChange={(e) => { setModel(e.target.value); setStatus('idle') }} className="mt-1" /></label>
          <label className="block text-sm"><Trans>API key</Trans><Input type="password" autoComplete="off" value={apiKey} onChange={(e) => { setApiKey(e.target.value); setStatus('idle') }} className="mt-1" /></label>
          <p className="text-xs text-muted-foreground">
            <Trans>Stored only in this browser and sent only to {PROVIDER_LABEL[provider]}. Only merchant names are sent, never amounts or dates.</Trans>
          </p>
          <div className="flex items-center gap-3">
            <Button onClick={saveAndTest} disabled={!apiKey.trim() || !model.trim() || status === 'testing'}>
              {status === 'testing' ? <Trans>Testing…</Trans> : <Trans>Save & test key</Trans>}
            </Button>
            {status === 'ok' && <span className="text-sm text-green-600"><Trans>Key works.</Trans></span>}
            {status === 'fail' && <span className="text-sm text-red-600"><Trans>Key test failed: {error}</Trans></span>}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle><Trans>Backup</Trans></CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={download}><Trans>Export backup</Trans></Button>
          <label className="kicker cursor-pointer border px-3 py-2 hover:bg-muted">
            <Trans>Import backup</Trans>
            <input type="file" accept="application/json,.json" className="sr-only" onChange={restore} />
          </label>
          {backupMsg && <span className="text-sm">{backupMsg}</span>}
        </CardContent>
      </Card>
    </div>
  )
}
