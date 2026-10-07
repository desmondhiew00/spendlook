import { I18nProvider } from '@lingui/react'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { UnlockScreen } from './components/unlock-screen'
import { i18n } from './i18n'
import { isLocked } from './lib/vault'
import { router } from './router'
import './index.css'

function App() {
  const [locked, setLocked] = useState(isLocked)
  return locked ? <UnlockScreen onUnlock={() => setLocked(false)} /> : <RouterProvider router={router} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <App />
    </I18nProvider>
  </StrictMode>,
)
