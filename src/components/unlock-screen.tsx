import { Trans, useLingui } from '@lingui/react/macro'
import { Loader2, Lock } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { ConfirmDelete } from '@/components/confirm-delete'
import { LogoMark } from '@/components/logo-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteAllData } from '@/lib/backup'
import { saveMeta, unlock } from '@/lib/vault'

// Shown instead of the app while the vault is locked: nothing else touches the database until the key is in memory
export function UnlockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useLingui()
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await unlock(passphrase)
      onUnlock()
    } catch {
      setError(t`Wrong passphrase.`)
      setBusy(false)
    }
  }

  async function wipe() {
    saveMeta(null)
    await deleteAllData()
    try {
      localStorage.clear()
    } catch {}
    location.assign('/')
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4 text-foreground">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 border bg-card p-6">
        <div className="flex items-center gap-2 text-lg font-bold tracking-tight"><LogoMark className="size-6" />spendlook<span className="-ml-2 text-primary">.</span></div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="size-4" /><Trans>Your data is encrypted. Enter your passphrase to unlock it.</Trans></p>
        <div className="space-y-2">
          <Label htmlFor="unlock-passphrase"><Trans>Passphrase</Trans></Label>
          <Input id="unlock-passphrase" type="password" autoComplete="current-password" autoFocus value={passphrase} onChange={(e) => setPassphrase(e.target.value)} aria-invalid={!!error} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={busy || !passphrase}>
          {busy && <Loader2 className="animate-spin motion-reduce:animate-none" data-icon="inline-start" />}<Trans>Unlock</Trans>
        </Button>
        <ConfirmDelete
          trigger={<Button type="button" variant="link" className="w-full text-muted-foreground"><Trans>Forgot it? Start over</Trans></Button>}
          title={<Trans>Delete all data?</Trans>}
          description={<Trans>Without the passphrase the data cannot be decrypted by anyone, including us. Starting over erases every account, transaction and setting in this browser. A backup can be restored later only with its own passphrase.</Trans>}
          confirmLabel={<Trans>Delete all data</Trans>}
          onConfirm={wipe}
        />
      </form>
    </main>
  )
}
