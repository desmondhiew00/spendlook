export const SPENDING = [
  'groceries', 'dining', 'transport', 'rent', 'utilities', 'phone_internet', 'shopping',
  'health', 'entertainment', 'travel', 'subscriptions', 'paypay', 'transfer_out', 'other', 'excluded',
] as const
export const INCOME = ['salary', 'cashback_points', 'transfer_in', 'interest', 'other_income', 'excluded'] as const
// AI may not assign rule-only or user-only categories (paypay, transfer_out, excluded)
export const AI_SPENDING = [
  'groceries', 'dining', 'transport', 'rent', 'utilities', 'phone_internet', 'shopping',
  'health', 'entertainment', 'travel', 'subscriptions', 'other',
] as const
export const AI_INCOME = ['salary', 'cashback_points', 'transfer_in', 'interest', 'other_income'] as const

export type SpendingCategory = (typeof SPENDING)[number]
export type IncomeCategory = (typeof INCOME)[number]
export type Category = SpendingCategory | IncomeCategory

export type AccountType = 'mufg' | 'paypay'
export type Kind = 'expense' | 'income' | 'transfer'
export type Flow = Exclude<Kind, 'transfer'>

export interface Account { id: string; type: AccountType; name: string; currency: string; createdAt: number }

export interface ParsedRow {
  key: string // dedupe key within an account
  date: string // YYYY-MM-DD
  kind: Kind
  amount: number // integer minor units of account currency (JPY = yen); negative = refund
  rawMerchant: string
  merchantKey: string
  method?: string
  fixedCategory?: Category
}

export interface Txn extends ParsedRow {
  id: string // `${accountId}:${key}`
  accountId: string
  uploadId: string
  month: string // YYYY-MM
  overrideCategory?: Category
}

export interface Merchant {
  id: string // merchantId(kind, merchantKey)
  kind: Flow
  merchantKey: string
  displayName: string
  overrideName?: string // user rename; wins over the AI displayName and survives re-categorizing
  aiCategory?: Category
  confidence?: number
  overrideCategory?: Category
  needsReview: boolean
}

export interface Upload { id: string; accountId: string; fileName: string; createdAt: number; added: number; skipped: number }

export const merchantId = (kind: Flow, merchantKey: string) => `${kind}|${merchantKey}`
export const merchantName = (m: Merchant | undefined, rawMerchant: string) => m?.overrideName ?? m?.displayName ?? rawMerchant.normalize('NFKC')
