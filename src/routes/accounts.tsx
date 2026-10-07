import { Trans, useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { db } from '@/lib/db'
import { deleteAccount } from '@/lib/importer'
import { loadSettings } from '@/lib/settings'
import type { AccountType } from '@/lib/types'

export function AccountsPage() {
  const { t } = useLingui()
  const accounts = useLiveQuery(() => db.accounts.toArray().then((a) => a.sort((x, y) => x.createdAt - y.createdAt)), [])
  const [type, setType] = useState<AccountType>('mufg')
  const [name, setName] = useState('')
  const verified = loadSettings()?.verified

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    // MUFG and PayPay are JPY; custom accounts (v2) will let the user pick
    await db.accounts.add({ id: crypto.randomUUID(), type, name: name.trim(), currency: 'JPY', createdAt: Date.now() })
    setName('')
  }

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold tracking-[-0.04em]"><Trans>Accounts</Trans></h1>
      {!verified && (
        <p className="rounded border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <Trans>Set your AI provider key in <Link to="/settings" className="underline">Settings</Link> before uploading.</Trans>
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts?.map((a) => (
          <li key={a.id}>
            <Card>
              <CardHeader>
                <CardTitle><Link to="/accounts/$accountId" params={{ accountId: a.id }} className="hover:underline">{a.name}</Link></CardTitle>
                <CardDescription>{a.type === 'mufg' ? 'MUFG' : 'PayPay'}</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button variant="ghost" size="sm" onClick={() => confirm(t`Delete this account and all its transactions?`) && deleteAccount(a.id)}>
                  <Trans>Delete</Trans>
                </Button>
              </CardFooter>
            </Card>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <select aria-label={t`Account type`} value={type} onChange={(e) => setType(e.target.value as AccountType)} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="mufg">MUFG</option>
          <option value="paypay">PayPay</option>
        </select>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t`Account name`} className="max-w-xs" />
        <Button type="submit"><Trans>Add account</Trans></Button>
      </form>
    </div>
  )
}
