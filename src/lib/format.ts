// amounts are integer minor units: JPY has 0 fraction digits, SGD has 2, etc.
export function formatMoney(minor: number, currency: string, locale: string) {
  const f = new Intl.NumberFormat(locale, { style: 'currency', currency })
  return f.format(minor / 10 ** (f.resolvedOptions().maximumFractionDigits ?? 0))
}

export const formatMonth = (month: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short' }).format(new Date(`${month}-01T00:00:00`))
