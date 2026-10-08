import { Trans, useLingui } from '@lingui/react/macro'
import { Check, Copy, Download, Fingerprint, Loader2 } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { enableEncryption } from '@/lib/encryption'
import { type Weakness, addPasskey, isWrongSecret, passkeysSupported, passphraseWeakness } from '@/lib/vault'

export function useWeaknessText() {
  const { t } = useLingui()
  return (w: Weakness | null) =>
    w === 'short'
      ? t`Use at least 12 characters.`
      : w === 'common'
        ? t`This is a commonly used password. Pick something only you would think of.`
        : w === 'weak'
          ? t`Too easy to guess. Try a few unrelated words, like a short sentence.`
          : ''
}

// New passphrase + repeat, with the strength rule shown as you type. Shared by setup and "change passphrase".
export function NewPassphraseFields({
  value,
  onChange,
  confirm,
  onConfirm,
  idPrefix,
}: {
  value: string
  onChange: (v: string) => void
  confirm: string
  onConfirm: (v: string) => void
  idPrefix: string
}) {
  const { t } = useLingui()
  const weakness = passphraseWeakness(value)
  const why = useWeaknessText()
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-new`}>
          <Trans>Passphrase</Trans>
        </Label>
        <Input
          id={`${idPrefix}-new`}
          type="password"
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!value && !!weakness}
          aria-describedby={`${idPrefix}-hint`}
        />
        <p id={`${idPrefix}-hint`} className={`text-xs ${value && weakness ? 'text-destructive' : 'text-muted-foreground'}`}>
          {value && weakness ? why(weakness) : value ? t`Strong enough.` : t`At least 12 characters. A short sentence is easy to remember and hard to guess.`}
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-confirm`}>
          <Trans>Repeat passphrase</Trans>
        </Label>
        <Input id={`${idPrefix}-confirm`} type="password" autoComplete="new-password" value={confirm} onChange={(e) => onConfirm(e.target.value)} aria-invalid={!!confirm && confirm !== value} />
        {confirm && confirm !== value && (
          <p className="text-xs text-destructive">
            <Trans>The passphrases don't match.</Trans>
          </p>
        )}
      </div>
    </>
  )
}

// The recovery key, shown once: copy or save it, and confirm before moving on
export function RecoveryKeyStep({ code, onDone }: { code: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  function download() {
    const url = URL.createObjectURL(
      new Blob([`spendlook recovery key\n\n${code}\n\nUnlocks your encrypted spendlook data in this browser if you forget your passphrase.\nKeep it offline and private.\n`], { type: 'text/plain' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = 'spendlook-recovery-key.txt'
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="space-y-3">
      <p className="text-sm">
        <Trans>This recovery key unlocks your data if you forget your passphrase. It is shown only now. Save it somewhere safe and offline, like a password manager or on paper.</Trans>
      </p>
      <output className="block rounded-xl bg-muted p-3 text-center font-mono text-lg tracking-wider break-all select-all">{code}</output>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(code).then(() => setCopied(true))}>
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied ? <Trans>Copied</Trans> : <Trans>Copy</Trans>}
        </Button>
        <Button type="button" variant="outline" onClick={download}>
          <Download data-icon="inline-start" />
          <Trans>Save as file</Trans>
        </Button>
      </div>
      <Label className="cursor-pointer text-sm font-normal">
        <Checkbox checked={saved} onCheckedChange={(v) => setSaved(!!v)} />
        <Trans>I saved my recovery key</Trans>
      </Label>
      <Button type="button" disabled={!saved} onClick={onDone}>
        <Trans>Continue</Trans>
      </Button>
    </div>
  )
}

// Offered after setup and from Settings: unlock with Touch ID / Face ID / Windows Hello instead of typing
export function PasskeyStep({ onDone, skipLabel, passphrase }: { onDone: () => void; skipLabel?: ReactNode; passphrase: string }) {
  const { t } = useLingui()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const supported = passkeysSupported()
  useEffect(() => {
    if (!supported) onDone()
  }, [supported, onDone])
  if (!supported) return null
  async function add() {
    setBusy(true)
    setError('')
    try {
      await addPasskey(deviceName(), passphrase)
      onDone()
    } catch (e) {
      setError(isWrongSecret(e) ? t`Wrong passphrase.` : e instanceof Error && e.name !== 'NotAllowedError' ? e.message : t`No passkey was added.`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm">
        <Trans>Unlock with your fingerprint, face or device PIN instead of typing your passphrase. The key comes from your device's secure chip, so there is nothing to guess.</Trans>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={add} disabled={busy}>
          {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" data-icon="inline-start" /> : <Fingerprint data-icon="inline-start" />}
          <Trans>Add a passkey</Trans>
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {skipLabel ?? <Trans>Not now</Trans>}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export function deviceName() {
  const ua = navigator.userAgent
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Device'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''
  return `${os}${browser && ` · ${browser}`}`
}

// Passphrase → recovery key → optional passkey. Data is encrypted at the first step.
export function EncryptionSetup({ onDone, firstStepFooter }: { onDone: () => void; firstStepFooter?: ReactNode }) {
  const [step, setStep] = useState<'passphrase' | 'recovery' | 'passkey'>('passphrase')
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      setCode(await enableEncryption(pass))
      setConfirm('')
      setStep('recovery')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (step === 'recovery')
    return (
      <RecoveryKeyStep
        code={code}
        onDone={() => {
          setCode('')
          setStep('passkey')
        }}
      />
    )
  if (step === 'passkey')
    return (
      <PasskeyStep
        passphrase={pass}
        onDone={() => {
          setPass('')
          onDone()
        }}
      />
    )
  return (
    <form className="space-y-3" onSubmit={submit}>
      <NewPassphraseFields idPrefix="setup" value={pass} onChange={setPass} confirm={confirm} onConfirm={setConfirm} />
      <p className="text-xs text-muted-foreground">
        <Trans>Nobody, including us, can reset it. You'll get a recovery key next.</Trans>
      </p>
      <Button type="submit" disabled={busy || !!passphraseWeakness(pass) || pass !== confirm}>
        {busy && <Loader2 className="animate-spin motion-reduce:animate-none" data-icon="inline-start" />}
        {busy ? <Trans>Encrypting…</Trans> : <Trans>Turn on encryption</Trans>}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {firstStepFooter}
    </form>
  )
}
