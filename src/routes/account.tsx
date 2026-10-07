import { Trans } from '@lingui/react/macro'
import { useParams } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Dashboard } from '@/components/dashboard'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UploadPanel } from '@/components/upload-panel'
import { db } from '@/lib/db'
import type { Flow } from '@/lib/types'

export function AccountPage() {
  const { accountId } = useParams({ from: '/accounts/$accountId' })
  const account = useLiveQuery(() => db.accounts.get(accountId), [accountId], null)
  const [flow, setFlow] = useState<Flow>('expense')
  if (account === null) return null // loading
  if (!account) return <p><Trans>Account not found.</Trans></p>
  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold tracking-[-0.04em]">{account.name}</h1>
      <UploadPanel key={account.id} account={account} />
      <Tabs value={flow} onValueChange={(v) => setFlow(v as Flow)}>
        <TabsList>
          <TabsTrigger value="expense"><Trans>Spending</Trans></TabsTrigger>
          <TabsTrigger value="income"><Trans>Income</Trans></TabsTrigger>
        </TabsList>
      </Tabs>
      <Dashboard key={`${account.id}-${flow}`} accountId={account.id} currency={account.currency} flow={flow} hasMethod={account.type === 'paypay'} />
    </div>
  )
}
