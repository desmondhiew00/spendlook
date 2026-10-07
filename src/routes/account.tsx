import { Trans } from '@lingui/react/macro'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { AccountLogo } from '@/components/account-logo'
import { Dashboard } from '@/components/dashboard'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UploadPanel } from '@/components/upload-panel'
import { db } from '@/lib/db'
import type { Flow } from '@/lib/types'

export function AccountPage() {
  const { accountId } = useParams({ from: '/accounts/$accountId' })
  const account = useLiveQuery(() => db.accounts.get(accountId), [accountId], null)
  const search = useSearch({ from: '/accounts/$accountId' })
  const navigate = useNavigate({ from: '/accounts/$accountId' })
  const flow: Flow = search.flow ?? 'expense'
  // replace, not push: Back should leave the page, not step through every month clicked
  const setView = (next: { month?: string; flow?: Flow }) => navigate({ search: { ...search, ...next }, replace: true })
  if (account === null) return null // loading
  if (!account) return <p><Trans>Account not found.</Trans></p>
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <AccountLogo type={account.type} />
          <h1 className="truncate text-4xl font-bold tracking-[-0.04em]">{account.name}</h1>
        </div>
        <UploadPanel key={account.id} account={account} />
      </div>
      <Tabs value={flow} onValueChange={(v) => setView({ flow: v === 'income' ? 'income' : undefined })}>
        <TabsList>
          <TabsTrigger value="expense"><Trans>Spending</Trans></TabsTrigger>
          <TabsTrigger value="income"><Trans>Income</Trans></TabsTrigger>
        </TabsList>
      </Tabs>
      <Dashboard key={`${account.id}-${flow}`} accountId={account.id} currency={account.currency} flow={flow} month={search.month} onMonthChange={(month) => setView({ month })} hasMethod={account.type === 'paypay'} />
    </div>
  )
}
