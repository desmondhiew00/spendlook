import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { Category } from '@/lib/types'

export const CATEGORY_LABEL: Record<Category, MessageDescriptor> = {
  groceries: msg`Groceries`,
  dining: msg`Dining`,
  transport: msg`Transport`,
  rent: msg`Rent`,
  utilities: msg`Utilities`,
  phone_internet: msg`Phone & Internet`,
  shopping: msg`Shopping`,
  health: msg`Health`,
  entertainment: msg`Entertainment`,
  travel: msg`Travel`,
  subscriptions: msg`Subscriptions`,
  paypay: msg`PayPay`,
  transfer_out: msg`Sent to others`,
  other: msg`Other`,
  excluded: msg`Excluded`,
  salary: msg`Salary`,
  cashback_points: msg`Cashback & points`,
  transfer_in: msg`Received from others`,
  interest: msg`Interest`,
  other_income: msg`Other income`,
}

// One fixed color per category; stable across months and accounts
export const CATEGORY_COLOR: Record<Category, string> = {
  groceries: '#16a34a', dining: '#ea580c', transport: '#2563eb', rent: '#7c3aed', utilities: '#0891b2',
  phone_internet: '#0d9488', shopping: '#db2777', health: '#dc2626', entertainment: '#ca8a04', travel: '#4f46e5',
  subscriptions: '#9333ea', paypay: '#e11d48', transfer_out: '#64748b', other: '#94a3b8', excluded: '#cbd5e1',
  salary: '#16a34a', cashback_points: '#f59e0b', transfer_in: '#2563eb', interest: '#0891b2', other_income: '#94a3b8',
}
