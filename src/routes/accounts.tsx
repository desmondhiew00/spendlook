import { Trans, useLingui } from '@lingui/react/macro'
import { Link, useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Plus, Trash2, X } from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import { ACCOUNT_LABEL, AccountLogo } from '@/components/account-logo'
import { ConfirmDelete } from '@/components/confirm-delete'
import { Picker } from '@/components/picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { db } from '@/lib/db'
import { deleteAccount } from '@/lib/importer'
import { loadSettings } from '@/lib/settings'
import type { Account, AccountType } from '@/lib/types'

export function AccountsPage() {
  const accounts = useLiveQuery(() => db.accounts.toArray().then((a) => a.sort((x, y) => x.createdAt - y.createdAt)), [])
  const [adding, setAdding] = useState(false)
  const verified = loadSettings()?.verified
  if (!accounts) return null
  const showForm = adding || !accounts.length

  return (
    <div className="space-y-6">
      {accounts.length ? <h1 className="text-4xl font-bold tracking-[-0.04em]"><Trans>Accounts</Trans></h1> : <Intro />}
      {!verified && (
        <p className="border p-3 text-sm text-muted-foreground">
          <Trans>Optional: add an AI key in <Link to="/settings" className="underline">Settings</Link> to auto-categorize merchants. Without one, nothing leaves this browser and you pick categories yourself.</Trans>
        </p>
      )}
      {!!accounts.length && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => <AccountCard key={a.id} account={a} />)}
          {!showForm && (
            <li>
              <button type="button" onClick={() => setAdding(true)} className="flex h-full min-h-44 w-full cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-input text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                <Plus className="size-5" />
                <span className="kicker"><Trans>Add account</Trans></span>
              </button>
            </li>
          )}
        </ul>
      )}
      {showForm && <AddAccountForm onCancel={accounts.length ? () => setAdding(false) : undefined} />}
    </div>
  )
}

// first-visit pitch; also the indexable text of / and /ja (search engines see an empty browser)
function Intro() {
  return (
    <section className="max-w-2xl space-y-3">
      <h1 className="text-4xl font-bold tracking-[-0.04em]"><Trans>Your bank CSVs, as a spending dashboard</Trans></h1>
      <p className="text-muted-foreground"><Trans>spendlook turns the CSV exports from your bank and e-wallet into monthly spending charts and categories. Everything runs in your browser.</Trans></p>
      <ul className="list-inside list-disc space-y-1 text-sm">
        <li><Trans>Private: transactions stay in this browser. No sign-up, no server.</Trans></li>
        <li><Trans>MUFG and PayPay built in. Any other bank or e-wallet CSV works with a column mapping.</Trans></li>
        <li><Trans>Optional AI categorization with your own Anthropic, Gemini or OpenAI key. Only merchant names are sent, never amounts or dates. Optional passphrase encryption.</Trans></li>
      </ul>
    </section>
  )
}

function AccountCard({ account: a }: { account: Account }) {
  const { t, i18n } = useLingui()
  const count = useLiveQuery(() => db.txns.where('accountId').equals(a.id).count(), [a.id])
  const last = useLiveQuery(() => db.uploads.where('accountId').equals(a.id).reverse().sortBy('createdAt').then((u) => u[0]?.createdAt ?? 0), [a.id])
  return (
    <li className="group relative">
      <Link to="/accounts/$accountId" params={{ accountId: a.id }} className="flex h-full min-h-44 flex-col gap-4 border bg-card p-4 transition-colors hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        <div className="flex items-center gap-3 pr-8">
          <AccountLogo type={a.type} />
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold">{a.name}</div>
            <div className="kicker text-muted-foreground">{a.type === 'custom' ? <Trans>Custom CSV · {a.currency}</Trans> : ACCOUNT_LABEL[a.type]}</div>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="kicker text-muted-foreground"><Trans>Transactions</Trans></dt><dd className="mt-1 tabular-nums">{count ?? '—'}</dd></div>
          <div><dt className="kicker text-muted-foreground"><Trans>Last upload</Trans></dt><dd className="mt-1 tabular-nums">{last ? new Date(last).toLocaleDateString(i18n.locale) : '—'}</dd></div>
        </dl>
        <span className="kicker mt-auto flex items-center gap-1 text-primary">
          {count ? <Trans>View dashboard</Trans> : <Trans>Upload CSV</Trans>}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </span>
      </Link>
      <ConfirmDelete
        trigger={<Button variant="ghost" size="icon-sm" aria-label={t`Delete ${a.name}`} title={t`Delete ${a.name}`} className="absolute top-3 right-3 text-muted-foreground hover:text-destructive"><Trash2 /></Button>}
        title={<Trans>Delete “{a.name}”?</Trans>}
        description={<Trans>This permanently removes the account and its {count ?? 0} transactions from this browser. Export a backup in Settings first if you might need them.</Trans>}
        confirmLabel={<Trans>Delete account</Trans>}
        onConfirm={() => deleteAccount(a.id)}
      />
    </li>
  )
}

function AddAccountForm({ onCancel }: { onCancel?: () => void }) {
  const { t, i18n } = useLingui()
  const navigate = useNavigate()
  const [type, setType] = useState<AccountType>('mufg')
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('JPY')
  const currencies = useMemo(() => currencyOptions(i18n.locale), [i18n.locale])
  const sources: { type: AccountType; title: string; hint: string }[] = [
    { type: 'mufg', title: 'MUFG', hint: t`Bank account · 入出金明細 CSV` },
    { type: 'paypay', title: 'PayPay', hint: t`Wallet · payment history CSV` },
    { type: 'custom', title: t`Other bank or wallet`, hint: t`Any CSV · columns mapped on first upload` },
  ]
  const fallbackName = type === 'custom' ? t`My account` : ACCOUNT_LABEL[type]

  async function add(e: FormEvent) {
    e.preventDefault()
    const id = crypto.randomUUID()
    // MUFG and PayPay are JPY; custom accounts pick their currency
    await db.accounts.add({ id, type, name: name.trim() || fallbackName, currency: type === 'custom' ? currency : 'JPY', createdAt: Date.now() })
    navigate({ to: '/accounts/$accountId', params: { accountId: id } })
  }

  return (
    <form onSubmit={add} className="space-y-5 border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="kicker text-primary"><Trans>Add account</Trans></h2>
        {onCancel && <Button variant="ghost" size="icon-sm" aria-label={t`Cancel`} onClick={onCancel}><X /></Button>}
      </div>
      <div className="space-y-2">
        <div id="account-source" className="text-sm font-medium"><Trans>1. Where is the CSV from?</Trans></div>
        <RadioGroup aria-labelledby="account-source" value={type} onValueChange={(v) => setType(v as AccountType)} className="gap-3 sm:grid-cols-3">
          {sources.map((s) => (
            <Label key={s.type} className={`cursor-pointer gap-3 border p-4 font-normal leading-normal transition-colors ${type === s.type ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}>
              <AccountLogo type={s.type} className="size-12" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{s.title}</div>
                <div className="text-sm text-muted-foreground">{s.hint}</div>
              </div>
              <RadioGroupItem value={s.type} />
            </Label>
          ))}
        </RadioGroup>
      </div>
      {type === 'custom' && (
        <div className="space-y-2">
          <div className="text-sm font-medium"><Trans>Currency</Trans></div>
          <Picker label={t`Currency`} value={currency} onChange={setCurrency} options={currencies} className="max-w-sm" />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="account-name"><Trans>2. Name it (optional)</Trans></Label>
        <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={fallbackName} className="max-w-sm" />
      </div>
      <Button type="submit" size="lg"><Trans>Create and upload CSV</Trans><ArrowRight data-icon="inline-end" /></Button>
    </form>
  )
}

// Asian currencies first (the target markets), then every other ISO code the browser knows
const FIRST = ['JPY', 'MYR', 'SGD', 'THB', 'IDR', 'PHP', 'VND', 'KRW', 'TWD', 'HKD', 'CNY', 'INR', 'USD', 'EUR', 'GBP', 'AUD']
function currencyOptions(locale: string) {
  const names = new Intl.DisplayNames([locale], { type: 'currency' })
  const all = Intl.supportedValuesOf('currency')
  return [...FIRST, ...all.filter((c) => !FIRST.includes(c))].map((c) => ({ value: c, label: `${c} · ${names.of(c) ?? c}` }))
}
