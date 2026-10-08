import { useLingui } from '@lingui/react/macro'
import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

const mq = () => matchMedia('(prefers-color-scheme: dark)')

function saved(): 'light' | 'dark' | null {
  try {
    const t = localStorage.getItem('theme')
    if (t === 'light' || t === 'dark') return t
  } catch {}
  return null
}

// Two states only. Until the first click the theme follows the system (and keeps following it);
// a click pins the opposite of what's showing. Initial class is set pre-paint by public/theme.js; keep in sync.
export function ThemeToggle() {
  const { t } = useLingui()
  const [pinned, setPinned] = useState(saved)
  const [systemDark, setSystemDark] = useState(() => mq().matches)
  const dark = pinned ? pinned === 'dark' : systemDark

  useEffect(() => {
    const m = mq()
    const onChange = () => setSystemDark(m.matches)
    m.addEventListener('change', onChange)
    return () => m.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  function toggle() {
    const next = dark ? 'light' : 'dark'
    setPinned(next)
    try {
      localStorage.setItem('theme', next)
    } catch {}
  }

  const label = dark ? t`Switch to light mode` : t`Switch to dark mode`
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={toggle}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  )
}
