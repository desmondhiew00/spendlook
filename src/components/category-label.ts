import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { BuiltinCategory } from '@/lib/types'

export const CATEGORY_LABEL: Record<BuiltinCategory, MessageDescriptor> = {
  groceries: msg`Groceries`,
  dining: msg`Dining`,
  daily_goods: msg`Daily goods`,
  transport: msg`Transport`,
  car: msg`Car`,
  rent: msg`Rent`,
  utilities: msg`Utilities`,
  phone_internet: msg`Phone & Internet`,
  shopping: msg`Shopping`,
  clothing_beauty: msg`Clothing & beauty`,
  health: msg`Health`,
  insurance: msg`Insurance`,
  education: msg`Education`,
  entertainment: msg`Entertainment`,
  travel: msg`Travel`,
  subscriptions: msg`Subscriptions`,
  gifts_social: msg`Gifts & social`,
  taxes_social: msg`Taxes & social insurance`,
  paypay: msg`PayPay`,
  transfer_out: msg`Sent to others`,
  card_payment: msg`Card payment`,
  cash_withdrawal: msg`Cash withdrawal`,
  other: msg`Other`,
  excluded: msg`Excluded`,
  salary: msg`Salary`,
  bonus: msg`Bonus`,
  side_income: msg`Side income`,
  investment: msg`Investment`,
  refund: msg`Refunds`,
  cashback_points: msg`Cashback & points`,
  transfer_in: msg`Received from others`,
  interest: msg`Interest`,
  other_income: msg`Other income`,
}

// iOS system colors (mid-tone between light and dark variants so one value reads on both grounds)
export const SERIES_COLORS = ['#0a84ff', '#ff9f0a', '#30d158', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a'] as const
// The "Other" fold bucket stays neutral and never takes a hue
export const FOLD_COLOR = '#8e8e93'
