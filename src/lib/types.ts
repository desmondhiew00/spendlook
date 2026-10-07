// Order is display order and fixes each category's chart colour slot; keys are stored, so never rename one
export const SPENDING = [
  'groceries', 'dining', 'daily_goods', 'transport', 'car', 'rent', 'utilities', 'phone_internet',
  'shopping', 'clothing_beauty', 'health', 'insurance', 'education', 'entertainment', 'travel',
  'subscriptions', 'gifts_social', 'taxes_social', 'paypay', 'transfer_out', 'card_payment', 'cash_withdrawal',
  'other', 'excluded',
] as const
export const INCOME = [
  'salary', 'bonus', 'side_income', 'investment', 'refund', 'cashback_points', 'transfer_in', 'interest',
  'other_income', 'excluded',
] as const
// AI may not assign rule-only or user-only categories (paypay, transfer_out, excluded)
export const AI_SPENDING = [
  'groceries', 'dining', 'daily_goods', 'transport', 'car', 'rent', 'utilities', 'phone_internet',
  'shopping', 'clothing_beauty', 'health', 'insurance', 'education', 'entertainment', 'travel',
  'subscriptions', 'gifts_social', 'taxes_social', 'card_payment', 'cash_withdrawal', 'other',
] as const
export const AI_INCOME = ['salary', 'bonus', 'side_income', 'investment', 'refund', 'cashback_points', 'transfer_in', 'interest', 'other_income'] as const

export type SpendingCategory = (typeof SPENDING)[number]
export type IncomeCategory = (typeof INCOME)[number]
export type Category = SpendingCategory | IncomeCategory

// Money moving between your own pots (card bill, cash out) or hidden by you: listed, never totalled.
// Counting a card bill would double-count the purchases already tracked on the card itself.
export const UNCOUNTED: readonly Category[] = ['excluded', 'card_payment', 'cash_withdrawal']
export const counts = (c: Category) => !UNCOUNTED.includes(c)

export type AccountType = 'mufg' | 'paypay'
export type Kind = 'expense' | 'income' | 'transfer'
export type Flow = Exclude<Kind, 'transfer'>

export interface Account { id: string; type: AccountType; name: string; currency: string; createdAt: number }

export interface ParsedRow {
  key: string // dedupe key within an account
  date: string // YYYY-MM-DD
  time?: string // HH:MM, only when the source has it (PayPay; MUFG is date-only)
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

// One AI request. Tokens come from the provider's response; cost is derived later from editable prices.
export interface AiUsage {
  id: string
  at: number
  provider: string
  model: string
  job: 'categorize' | 'recategorize' | 'test'
  items: number // merchants in the request, for per-merchant cost estimates
  inputTokens: number
  outputTokens: number
  ok: boolean // false when the response was billed but could not be parsed
}

export interface Upload { id: string; accountId: string; fileName: string; createdAt: number; added: number; skipped: number }

export const merchantId = (kind: Flow, merchantKey: string) => `${kind}|${merchantKey}`
export const merchantName = (m: Merchant | undefined, rawMerchant: string) => m?.overrideName ?? m?.displayName ?? rawMerchant.normalize('NFKC')
