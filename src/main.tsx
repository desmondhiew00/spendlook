import './security'
import { I18nProvider } from '@lingui/react'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { UnlockScreen } from './components/unlock-screen'
import { i18n } from './i18n'
import { autoLockMinutes, isEnabled, isLocked, lock } from './lib/vault'
import { router } from './router'
import './index.css'

// Locks after a quiet spell (no input, or the tab in the background). Reloading drops every decrypted value
// React holds in memory, not just the key.
function useAutoLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    let last = Date.now()
    const bump = () => {
      last = Date.now()
    }
    const check = () => {
      if (isEnabled() && Date.now() - last > autoLockMinutes() * 60_000) {
        lock()
        location.reload()
      }
    }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    for (const e of events) addEventListener(e, bump, { passive: true, capture: true })
    document.addEventListener('visibilitychange', check) // background tabs throttle timers; check on return
    const timer = setInterval(check, 10_000)
    return () => {
      for (const e of events) removeEventListener(e, bump, { capture: true })
      document.removeEventListener('visibilitychange', check)
      clearInterval(timer)
    }
  }, [active])
}

function App() {
  const [locked, setLocked] = useState(isLocked)
  useAutoLock(!locked)
  return locked ? <UnlockScreen onUnlock={() => setLocked(false)} /> : <RouterProvider router={router} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <App />
    </I18nProvider>
  </StrictMode>,
)
