export function normalizeMerchant(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/(?<=[゠-ヿ])[−\-]/g, 'ー') // MUFG writes カ−ド with U+2212
    .replace(/^\d{6}\s+/, '') // MUFG debit authorization number
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

// A transfer to or from a person carries their name, which is never sent to the AI: these rows get a fixed
// transfer category instead (the user can still re-categorize each one). Companies keep AI categorization, so a
// salary paid by "アスカル (カ" still lands in salary: Japanese banks mark legal entities with (カ, (ユ, ...
const TRANSFER = /振込|TRANSFER|TRSF|\bTRF\b|\bIBG\b|\bGIRO\b|ZELLE|VENMO|转账|轉帳|이체/i
const COMPANY = /[()（）]|株式会社|有限会社|合同会社|\b(LTD|LIMITED|INC|LLC|CORP|BHD|PTE|GMBH|PLC|CO)\b\.?/i
export const isCompany = (name: string) => COMPANY.test(name)
export const isPersonTransfer = (text: string) => TRANSFER.test(text) && !isCompany(text)
