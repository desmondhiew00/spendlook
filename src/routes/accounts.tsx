import { Trans, useLingui } from '@lingui/react/macro'
import { Link, useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, FileSpreadsheet, Lock, Plus, ShieldAlert, Sparkles, Trash2, X } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import dashboardDark from '@/assets/screenshots/dashboard-dark.webp'
import dashboardLight from '@/assets/screenshots/dashboard-light.webp'
import { ACCOUNT_LABEL, AccountLogo } from '@/components/account-logo'
import { ConfirmDelete } from '@/components/confirm-delete'
import { EncryptionSetup } from '@/components/encryption-setup'
import { Button } from '@/components/ui/button'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { db } from '@/lib/db'
import { deleteAccount } from '@/lib/importer'
import { loadSettings } from '@/lib/settings'
import { isEnabled, skipEncryption, skippedEncryption } from '@/lib/vault'
import type { Account, AccountType } from '@/lib/types'

export function AccountsPage() {
  const accounts = useLiveQuery(() => db.accounts.toArray().then((a) => a.sort((x, y) => x.createdAt - y.createdAt)), [])
  const { t } = useLingui()
  const [adding, setAdding] = useState(false)
  const verified = loadSettings()?.verified
  if (!accounts) return null
  const showForm = adding || !accounts.length
  const notes = (
    <>
      {!!accounts.length && !isEnabled() && (
        <p className="flex items-start gap-2 rounded-2xl bg-amber-500/10 p-4 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <span>
            <Trans>
              Your data isn't encrypted. Anyone with access to this device can read it.{' '}
              <Link to="/settings" className="underline">
                Turn on encryption
              </Link>
            </Trans>
          </span>
        </p>
      )}
      {!verified && (
        <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground">
          <Trans>
            Optional: add an AI key in{' '}
            <Link to="/settings" className="underline">
              Settings
            </Link>{' '}
            to auto-categorize merchants. Without one, nothing leaves this browser and you pick categories yourself.
          </Trans>
        </p>
      )}
    </>
  )

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
      {accounts.length ? (
        <div className="flex items-center justify-between">
          <h1 className="text-[2.125rem] font-bold tracking-[-0.02em]">
            <Trans>Accounts</Trans>
          </h1>
          {!showForm && (
            <Button variant="secondary" size="icon-lg" aria-label={t`Add account`} title={t`Add account`} onClick={() => setAdding(true)}>
              <Plus />
            </Button>
          )}
        </div>
      ) : (
        <Intro />
      )}
      {accounts.length ? (
        <>
          {/* every card shows its full face; Wallet look without the stack hiding counts */}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => (
              <AccountCard key={a.id} account={a} />
            ))}
          </ul>
          <div className="grid gap-3 md:grid-cols-2">{notes}</div>
        </>
      ) : (
        <div className="max-w-md space-y-3">{notes}</div>
      )}
      {showForm && <AddAccountForm onCancel={accounts.length ? () => setAdding(false) : undefined} />}
    </div>
  )
}

// first-visit pitch; also the indexable text of / and /ja (search engines see an empty browser)
const FADE_UP = 'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 motion-reduce:animate-none'

function Intro() {
  const { t } = useLingui()
  return (
    <section className="relative isolate grid items-center gap-10 pt-6 md:grid-cols-[1fr_1.2fr] md:pt-12">
      <div className="space-y-5">
        <h1 className={`text-5xl leading-[1.05] font-bold tracking-[-0.03em] text-balance sm:text-6xl ${FADE_UP}`}>
          <Trans>Your bank CSVs, as a spending dashboard</Trans>
        </h1>
        <p className={`max-w-xl text-lg text-pretty text-muted-foreground delay-100 ${FADE_UP}`}>
          <Trans>spendlook turns the CSV exports from your bank and e-wallet into monthly spending charts and categories. Everything runs in your browser.</Trans>
        </p>
      </div>
      {/* sample-data dashboard (bun run screenshots); the theme's copy only, the other stays display:none and lazy, so it never loads */}
      <div className={`overflow-hidden rounded-2xl shadow-[0_20px_50px_-20px_rgb(0_0_0/0.35)] ring-1 ring-foreground/10 delay-200 ${FADE_UP}`}>
        {[
          { src: dashboardLight, className: 'dark:hidden' },
          { src: dashboardDark, className: 'hidden dark:block' },
        ].map(({ src, className }) => (
          <img key={src} src={src} width={1600} height={1139} loading="lazy" alt={t`spendlook dashboard with a year of sample spending by category`} className={`h-auto w-full ${className}`} />
        ))}
      </div>
      <ul className="grid gap-3 text-sm sm:grid-cols-3 md:col-span-2">
        {[
          { Icon: Lock, text: <Trans>Private: transactions stay in this browser. No sign-up, no server.</Trans> },
          { Icon: FileSpreadsheet, text: <Trans>MUFG and PayPay built in. Any other bank or e-wallet CSV works with a column mapping.</Trans> },
          {
            Icon: Sparkles,
            text: <Trans>Optional AI categorization with your own Anthropic, Gemini or OpenAI key. Only merchant names are sent, never amounts or dates. Optional passphrase encryption.</Trans>,
          },
        ].map(({ Icon, text }, i) => (
          <li key={i} style={{ animationDelay: `${200 + i * 80}ms` }} className={`space-y-3 rounded-2xl bg-card p-5 ${FADE_UP}`}>
            <Icon className="size-5 text-primary" />
            <p className="leading-relaxed text-muted-foreground">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function AccountCard({ account: a }: { account: Account }) {
  const { t, i18n } = useLingui()
  const count = useLiveQuery(() => db.txns.where('accountId').equals(a.id).count(), [a.id])
  const last = useLiveQuery(
    () =>
      db.uploads
        .where('accountId')
        .equals(a.id)
        .reverse()
        .sortBy('createdAt')
        .then((u) => u[0]?.createdAt ?? 0),
    [a.id],
  )
  return (
    <li className="group relative">
      <Link
        to="/accounts/$accountId"
        params={{ accountId: a.id }}
        className={`flex h-52 flex-col justify-between rounded-[20px] p-5 text-white shadow-[0_-1px_0_rgb(255_255_255/0.15)_inset,0_10px_30px_-12px_rgb(0_0_0/0.45)] transition-transform duration-200 ease-out group-hover:-translate-y-1 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none ${CARD_FACE[a.type]}`}
      >
        <div className="flex items-center gap-3 pr-8">
          <AccountLogo type={a.type} className="size-9" />
          <div className="min-w-0">
            <div className="truncate text-[1.0625rem] font-semibold">{a.name}</div>
            <div className="text-[0.8125rem] text-white/70">{a.type === 'custom' ? <Trans>Custom CSV · {a.currency}</Trans> : ACCOUNT_LABEL[a.type]}</div>
          </div>
        </div>
        <dl className="flex items-end justify-between gap-3">
          <div>
            <dt className="text-[0.8125rem] text-white/70">
              <Trans>Transactions</Trans>
            </dt>
            <dd className="text-3xl font-semibold tracking-tight tabular-nums">
              {count ||
                (count === 0 ? (
                  <span className="text-lg">
                    <Trans>Upload CSV</Trans>
                  </span>
                ) : (
                  '—'
                ))}
            </dd>
          </div>
          <div className="text-right">
            <dt className="text-[0.8125rem] text-white/70">
              <Trans>Last upload</Trans>
            </dt>
            <dd className="tabular-nums">{last ? new Date(last).toLocaleDateString(i18n.locale) : '—'}</dd>
          </div>
        </dl>
      </Link>
      <ConfirmDelete
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t`Delete ${a.name}`}
            title={t`Delete ${a.name}`}
            className="absolute top-4 right-4 text-white/60 transition-transform duration-200 group-hover:-translate-y-1 hover:bg-white/15 hover:text-white motion-reduce:transition-none"
          >
            <Trash2 />
          </Button>
        }
        title={<Trans>Delete “{a.name}”?</Trans>}
        description={<Trans>This permanently removes the account and its {count ?? 0} transactions from this browser. Export a backup in Settings first if you might need them.</Trans>}
        confirmLabel={<Trans>Delete account</Trans>}
        onConfirm={() => deleteAccount(a.id)}
      />
    </li>
  )
}

// card faces in each issuer's colour family, kept apart in tone since MUFG and PayPay are both red
const CARD_FACE: Record<AccountType, string> = {
  mufg: 'bg-[linear-gradient(145deg,#d3112b,#7a0014)]',
  paypay: 'bg-[linear-gradient(145deg,#ff4d6d,#ff0033)]',
  custom: 'bg-[linear-gradient(145deg,#5a5a60,#1c1c1e)]',
}

function AddAccountForm({ onCancel }: { onCancel?: () => void }) {
  const { t, i18n } = useLingui()
  const navigate = useNavigate()
  const formRef = useRef<HTMLFormElement>(null)
  // opened from the + button (onCancel set): bring the form into view below the cards; first visit leaves the intro in place
  const opened = !!onCancel
  useEffect(() => {
    if (!opened) return
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
    formRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  }, [opened])
  const [type, setType] = useState<AccountType>('paypay')
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('JPY')
  const currencies = useMemo(() => currencyOptions(i18n.locale), [i18n.locale])
  const sources: { type: AccountType; title: string; hint: string }[] = [
    { type: 'paypay', title: 'PayPay', hint: t`Wallet · payment history CSV` },
    { type: 'mufg', title: 'MUFG', hint: t`Bank account · 入出金明細 CSV` },
    { type: 'custom', title: t`Other bank or wallet`, hint: t`Any CSV · columns mapped on first upload` },
  ]
  const fallbackName = type === 'custom' ? t`My account` : ACCOUNT_LABEL[type]

  // encryption is the default: before the first data is stored, ask for a passphrase (skippable, remembered)
  const [protect, setProtect] = useState(false)
  function add(e: FormEvent) {
    e.preventDefault()
    if (!isEnabled() && !skippedEncryption()) setProtect(true)
    else create()
  }

  async function create() {
    setProtect(false)
    const id = crypto.randomUUID()
    // MUFG and PayPay are JPY; custom accounts pick their currency
    await db.accounts.add({ id, type, name: name.trim() || fallbackName, currency: type === 'custom' ? currency : 'JPY', createdAt: Date.now() })
    navigate({ to: '/accounts/$accountId', params: { accountId: id } })
  }

  return (
    <>
      <Dialog open={protect} onOpenChange={setProtect}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <Trans>Protect your data first</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>Your transactions will be encrypted in this browser with a passphrase only you know. Without it, anyone with access to this device can read them.</Trans>
            </DialogDescription>
          </DialogHeader>
          <EncryptionSetup
            onDone={create}
            firstStepFooter={
              <Button
                type="button"
                variant="link"
                className="w-full text-muted-foreground"
                onClick={() => {
                  skipEncryption()
                  create()
                }}
              >
                <Trans>Continue without encryption</Trans>
              </Button>
            }
          />
        </DialogContent>
      </Dialog>
      <form ref={formRef} onSubmit={add} className="max-w-3xl scroll-mt-20 space-y-5 rounded-3xl bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            <Trans>Add account</Trans>
          </h2>
          {onCancel && (
            <Button variant="ghost" size="icon-sm" aria-label={t`Cancel`} onClick={onCancel}>
              <X />
            </Button>
          )}
        </div>
        <div className="space-y-2">
          <div id="account-source" className="text-sm font-medium">
            <Trans>1. Where is the CSV from?</Trans>
          </div>
          <RadioGroup aria-labelledby="account-source" value={type} onValueChange={(v) => setType(v as AccountType)} className="gap-3 sm:grid-cols-3">
            {sources.map((s) => (
              <Label
                key={s.type}
                className={`grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl p-4 font-normal leading-normal ring-1 transition-colors sm:grid-cols-[1fr_auto] sm:items-start ${type === s.type ? 'bg-primary/5 ring-2 ring-primary' : 'ring-border hover:bg-accent'}`}
              >
                {/* phone: one row (logo, text, radio). sm+: logo and radio on top, text below at full width,
                    so a long name doesn't squeeze into a tall card */}
                <AccountLogo type={s.type} className="size-10" />
                <div className="min-w-0 sm:col-span-2 sm:row-start-2">
                  <div className="font-semibold">{s.title}</div>
                  <div className="text-sm text-muted-foreground">{s.hint}</div>
                </div>
                <RadioGroupItem value={s.type} className="sm:col-start-2 sm:row-start-1" />
              </Label>
            ))}
          </RadioGroup>
        </div>
        {type === 'custom' && (
          <div className="space-y-2">
            <div className="text-sm font-medium">
              <Trans>Currency</Trans>
            </div>
            {/* searchable: code or localized name ("jpy", "yen") both match the label */}
            <Combobox
              items={currencies}
              value={currencies.find((c) => c.value === currency) ?? null}
              onValueChange={(c) => c && setCurrency(c.value)}
              isItemEqualToValue={(a, b) => a.value === b.value}
              autoHighlight
            >
              <ComboboxInput aria-label={t`Currency`} placeholder={t`Search currencies`} className="w-full max-w-sm" />
              <ComboboxContent>
                <ComboboxEmpty>{t`No matching currency`}</ComboboxEmpty>
                <ComboboxList>
                  {(c: (typeof currencies)[number]) => (
                    <ComboboxItem key={c.value} value={c}>
                      {c.label}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="account-name">
            <Trans>2. Name it (optional)</Trans>
          </Label>
          <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={fallbackName} className="max-w-sm" />
        </div>
        <Button type="submit" size="lg">
          <Trans>Create and upload CSV</Trans>
          <ArrowRight data-icon="inline-end" />
        </Button>
      </form>
    </>
  )
}

// Asian currencies first (the target markets), then every other ISO code the browser knows
const FIRST = ['JPY', 'MYR', 'SGD', 'THB', 'IDR', 'PHP', 'VND', 'KRW', 'TWD', 'HKD', 'CNY', 'INR', 'USD', 'EUR', 'GBP', 'AUD']
function currencyOptions(locale: string) {
  const names = new Intl.DisplayNames([locale], { type: 'currency' })
  const all = Intl.supportedValuesOf('currency')
  return [...FIRST, ...all.filter((c) => !FIRST.includes(c))].map((c) => ({ value: c, label: `${c} · ${names.of(c) ?? c}` }))
}
