import { cn } from 'cn'
import mufgLogo from '@/assets/mufg.svg'
import paypayLogo from '@/assets/paypay.svg'
import type { AccountType } from '@/lib/types'

export const ACCOUNT_LABEL: Record<AccountType, string> = { mufg: 'MUFG', paypay: 'PayPay' }
const LOGO: Record<AccountType, string> = { mufg: mufgLogo, paypay: paypayLogo }

// Official marks in one shared frame so they carry equal visual weight. The frame is white in both themes:
// MUFG's red rings need a light ground, and PayPay's "P" is a transparent cut-out.
export function AccountLogo({ type, className }: { type: AccountType; className?: string }) {
  return (
    <span className={cn('grid size-10 shrink-0 place-items-center border border-black/10 bg-white', className)}>
      <img src={LOGO[type]} alt="" className="size-4/5 object-contain" />
    </span>
  )
}
