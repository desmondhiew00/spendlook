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

// Validated categorical slots (dataviz palette, dark column, vs card surface #13181a): all six checks pass
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9', '#e66767'] as const
// The "Other" fold bucket stays neutral and never takes a hue
export const FOLD_COLOR = '#7a8180'
