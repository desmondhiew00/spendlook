import { Trans, useLingui } from '@lingui/react/macro'
import { Fingerprint, KeyRound, Loader2, Lock } from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'
import { ConfirmDelete } from '@/components/confirm-delete'
import { NewPassphraseFields } from '@/components/encryption-setup'
import { LogoMark } from '@/components/logo-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteAllData } from '@/lib/backup'
import { changePassphrase, finishPending } from '@/lib/encryption'
import { loadMeta, passkeysSupported, passphraseWeakness, saveMeta, unlock, unlockWithPasskey, unlockWithRecovery } from '@/lib/vault'

// Shown instead of the app while the vault is locked: nothing else touches the database until the key is in memory
export function UnlockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useLingui()
  const hasPasskey = passkeysSupported() && !!loadMeta()?.passkeys.length
  const [mode, setMode] = useState<'passphrase' | 'recovery' | 'reset'>('passphrase')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')

  async function attempt(fn: () => Promise<void>, wrong: string, after: () => void = done) {
    setBusy(true)
    setError('')
    try {
      await fn()
      await finishPending() // a tab closed while turning encryption on or off
      after()
    } catch (e) {
      setError(e instanceof Error && e.name === 'NotAllowedError' ? t`Cancelled.` : wrong)
    } finally {
      setBusy(false)
    }
  }
  const done = () => {
    setSecret('')
    onUnlock()
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'passphrase') await attempt(() => unlock(secret), t`Wrong passphrase.`)
    else if (mode === 'recovery')
      await attempt(
        () => unlockWithRecovery(secret),
        t`That recovery key doesn't match.`,
        () => {
          setSecret('')
          setMode('reset')
        },
      )
    else await attempt(() => changePassphrase(null, next), t`Could not save the new passphrase.`)
  }

  async function wipe() {
    saveMeta(null)
    await deleteAllData()
    try {
      localStorage.clear()
    } catch {}
    location.assign('/')
  }

  const spinner = busy && <Loader2 className="animate-spin motion-reduce:animate-none" data-icon="inline-start" />
  let body: ReactNode
  if (mode === 'reset') {
    body = (
      <>
        <p className="text-sm">
          <Trans>Unlocked with your recovery key. Set a new passphrase to continue.</Trans>
        </p>
        <NewPassphraseFields idPrefix="reset" value={next} onChange={setNext} confirm={confirm} onConfirm={setConfirm} />
        <Button type="submit" className="w-full" disabled={busy || !!passphraseWeakness(next) || next !== confirm}>
          {spinner}
          <Trans>Save passphrase</Trans>
        </Button>
      </>
    )
  } else {
    const recovery = mode === 'recovery'
    body = (
      <>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" />
          <Trans>Your data is encrypted. Unlock it to continue.</Trans>
        </p>
        {hasPasskey && !recovery && (
          <>
            <Button type="button" className="w-full" disabled={busy} onClick={() => attempt(unlockWithPasskey, t`This passkey couldn't unlock spendlook.`)}>
              {spinner || <Fingerprint data-icon="inline-start" />}
              <Trans>Unlock with passkey</Trans>
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              <Trans>or</Trans>
            </p>
          </>
        )}
        <div className="space-y-2">
          <Label htmlFor="unlock-secret">{recovery ? <Trans>Recovery key</Trans> : <Trans>Passphrase</Trans>}</Label>
          <Input
            id="unlock-secret"
            type={recovery ? 'text' : 'password'}
            autoComplete={recovery ? 'off' : 'current-password'}
            spellCheck={false}
            autoFocus={!hasPasskey}
            placeholder={recovery ? 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX' : undefined}
            className={recovery ? 'font-mono uppercase' : undefined}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            aria-invalid={!!error}
          />
        </div>
        <Button type="submit" variant={hasPasskey && !recovery ? 'outline' : 'default'} className="w-full" disabled={busy || !secret}>
          {spinner}
          <Trans>Unlock</Trans>
        </Button>
        <div>
          {loadMeta()?.recovery && (
            <Button
              type="button"
              variant="link"
              size="xs"
              className="w-full text-[11px] text-muted-foreground"
              onClick={() => {
                setMode(recovery ? 'passphrase' : 'recovery')
                setSecret('')
                setError('')
              }}
            >
              <KeyRound data-icon="inline-start" />
              {recovery ? <Trans>Use passphrase instead</Trans> : <Trans>Forgot it? Use your recovery key</Trans>}
            </Button>
          )}
          <ConfirmDelete
            trigger={
              <Button type="button" variant="link" size="xs" className="w-full text-[11px] text-muted-foreground">
                <Trans>Lost both? Start over</Trans>
              </Button>
            }
            title={<Trans>Delete all data?</Trans>}
            description={
              <Trans>
                Without the passphrase or recovery key the data cannot be decrypted by anyone, including us. Starting over erases every account, transaction and setting in this browser. A backup can
                be restored later only with its own passphrase.
              </Trans>
            }
            confirmLabel={<Trans>Delete all data</Trans>}
            onConfirm={wipe}
          />
        </div>
      </>
    )
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4 text-foreground">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <LogoMark className="size-6" />
          spendlook<span className="-ml-2 text-primary">.</span>
        </div>
        {body}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </main>
  )
}
