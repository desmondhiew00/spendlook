import { useLingui } from '@lingui/react/macro'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

type Theme = 'system' | 'light' | 'dark'
const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const ICON = { system: Monitor, light: Sun, dark: Moon }

function saved(): Theme {
  try {
    const t = localStorage.getItem('theme')
    if (t === 'light' || t === 'dark') return t
  } catch {}
  return 'system'
}

// initial class is set pre-paint by public/theme.js; this keeps it in sync after
export function ThemeToggle() {
  const { t } = useLingui()
  const [theme, setTheme] = useState(saved)

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches))
    apply()
    try {
      if (theme === 'system') localStorage.removeItem('theme')
      else localStorage.setItem('theme', theme)
    } catch {}
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  const label = { system: t`Theme: system`, light: t`Theme: light`, dark: t`Theme: dark` }[theme]
  const Icon = ICON[theme]
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={() => setTheme(NEXT[theme])}>
      <Icon />
    </Button>
  )
}
