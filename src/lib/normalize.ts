export function normalizeMerchant(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/(?<=[゠-ヿ])[−\-]/g, 'ー') // MUFG writes カ−ド with U+2212
    .replace(/^\d{6}\s+/, '') // MUFG debit authorization number
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}
