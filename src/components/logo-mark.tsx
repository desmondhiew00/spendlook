// The spendlook lens: spending bars seen through a square magnifier. Frame follows the text colour and the
// bars take the accent, so it works in both themes without a tile (favicon/touch icon carry their own tile).
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="10 10 46 46" className={className} aria-hidden="true">
      <rect x="12.5" y="12.5" width="29" height="29" rx="8" fill="none" stroke="currentColor" strokeWidth="5" />
      <g className="fill-primary">
        <rect rx="1.5" x="19" y="29" width="4.5" height="7" />
        <rect rx="1.5" x="25" y="24" width="4.5" height="12" />
        <rect rx="1.5" x="31" y="19" width="4.5" height="17" />
      </g>
      <path d="M42 42 L52 52" stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" />
    </svg>
  )
}
