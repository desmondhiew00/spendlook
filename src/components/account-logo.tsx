import { cn } from 'cn'
import { FileSpreadsheet } from 'lucide-react'
import mufgLogo from '@/assets/mufg.svg'
import paypayLogo from '@/assets/paypay.svg'
import type { AccountType } from '@/lib/types'

export const ACCOUNT_LABEL: Record<AccountType, string> = { mufg: 'MUFG', paypay: 'PayPay', custom: 'CSV' }
const LOGO: Partial<Record<AccountType, string>> = { mufg: mufgLogo, paypay: paypayLogo }

// Official marks in one shared frame so they carry equal visual weight. The frame is white in both themes:
// MUFG's red rings need a light ground, and PayPay's "P" is a transparent cut-out. Custom CSV accounts get a neutral icon.
export function AccountLogo({ type, className }: { type: AccountType; className?: string }) {
  const src = LOGO[type]
  return (
    <span className={cn('grid size-10 shrink-0 place-items-center border border-black/10 bg-white', className)}>
      {src ? <img src={src} alt="" className="size-4/5 object-contain" /> : <FileSpreadsheet aria-hidden="true" className="size-3/5 text-neutral-700" />}
    </span>
  )
}
