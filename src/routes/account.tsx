import { Trans, useLingui } from '@lingui/react/macro'
import { Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { AccountLogo } from '@/components/account-logo'
import { Dashboard } from '@/components/dashboard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UploadPanel } from '@/components/upload-panel'
import { resolveCategory } from '@/lib/aggregate'
import { db } from '@/lib/db'
import { formatMoney } from '@/lib/format'
import { type Flow, counts } from '@/lib/types'

export function AccountPage() {
  const { accountId } = useParams({ from: '/accounts/$accountId' })
  const account = useLiveQuery(() => db.accounts.get(accountId), [accountId], null)
  const search = useSearch({ from: '/accounts/$accountId' })
  const navigate = useNavigate({ from: '/accounts/$accountId' })
  const flow: Flow = search.flow ?? 'expense'
  // replace, not push: Back should leave the page, not step through every month clicked
  const setView = (next: { month?: string; flow?: Flow }) => navigate({ search: { ...search, ...next }, replace: true, viewTransition: false })
  const name = account?.name
  useEffect(() => {
    if (!name) return
    const prev = document.title
    document.title = `${name} · spendlook`
    return () => {
      document.title = prev
    }
  }, [name])
  if (account === null) return null // loading
  if (!account)
    return (
      <p>
        <Trans>Account not found.</Trans>
      </p>
    )
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <AccountLogo type={account.type} />
          <div className="min-w-0">
            <AccountName id={account.id} name={account.name} />
            <AccountTotals id={account.id} currency={account.currency} />
          </div>
        </div>
        <UploadPanel key={account.id} account={account} />
      </div>
      <Tabs value={flow} onValueChange={(v) => setView({ flow: v === 'income' ? 'income' : undefined })}>
        <TabsList>
          <TabsTrigger value="expense">
            <Trans>Spending</Trans>
          </TabsTrigger>
          <TabsTrigger value="income">
            <Trans>Income</Trans>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Dashboard
        key={`${account.id}-${flow}`}
        accountId={account.id}
        currency={account.currency}
        flow={flow}
        month={search.month}
        onMonthChange={(month) => setView({ month })}
        hasMethod={account.type === 'paypay'}
      />
    </div>
  )
}

// Click the pencil (or the name) to rename; Enter saves, Escape cancels, an empty name is ignored
function AccountName({ id, name }: { id: string; name: string }) {
  const { t } = useLingui()
  const [editing, setEditing] = useState(false)
  const heading = 'text-[2.125rem] font-bold tracking-[-0.02em]'
  if (editing) {
    return (
      <Input
        autoFocus
        defaultValue={name}
        aria-label={t`Account name`}
        maxLength={60}
        className={`h-12 w-[min(28rem,70vw)] ${heading} md:text-4xl`}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            e.currentTarget.value = name
            e.currentTarget.blur()
          }
        }}
        onBlur={(e) => {
          setEditing(false)
          const next = e.currentTarget.value.trim()
          if (next && next !== name) db.accounts.update(id, { name: next })
        }}
      />
    )
  }
  return (
    <div className="group/name flex min-w-0 items-center gap-1">
      <h1 className={`truncate ${heading}`} onDoubleClick={() => setEditing(true)}>
        {name}
      </h1>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t`Rename account`}
        title={t`Rename account`}
        onClick={() => setEditing(true)}
        className="text-muted-foreground opacity-60 group-hover/name:opacity-100 hover:opacity-100 focus-visible:opacity-100"
      >
        <Pencil />
      </Button>
    </div>
  )
}

// All-time counted totals; a side with nothing in it (PayPay has no income) is left out
function AccountTotals({ id, currency }: { id: string; currency: string }) {
  const { i18n } = useLingui()
  const txns = useLiveQuery(() => db.txns.where('accountId').equals(id).toArray(), [id])
  const merchantList = useLiveQuery(() => db.merchants.toArray(), [])
  if (!txns || !merchantList) return null
  const merchants = new Map(merchantList.map((m) => [m.id, m]))
  const total = (kind: Flow) => txns.filter((x) => x.kind === kind && counts(resolveCategory(x, merchants))).reduce((sum, x) => sum + x.amount, 0)
  const money = (n: number) => <span className="font-medium text-foreground tabular-nums">{formatMoney(n, currency, i18n.locale)}</span>
  const spending = total('expense')
  const income = total('income')
  if (!spending && !income) return null
  return (
    <div className="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
      {spending !== 0 && (
        <span>
          <Trans>Total spending</Trans> {money(spending)}
        </span>
      )}
      {income !== 0 && (
        <span>
          <Trans>Total income</Trans> {money(income)}
        </span>
      )}
    </div>
  )
}
