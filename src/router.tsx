import { Trans } from '@lingui/react/macro'
import { Link, Outlet, createRootRoute, createRoute, createRouter, useLocation } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { AccountLogo } from '@/components/account-logo'
import { LocaleToggle } from '@/components/locale-toggle'
import { ThemeToggle } from '@/components/theme-toggle'
import { db } from '@/lib/db'
import type { Flow } from '@/lib/types'
import { AccountPage } from '@/routes/account'
import { AccountsPage } from '@/routes/accounts'
import { SettingsPage } from '@/routes/settings'

function Layout() {
  const accounts = useLiveQuery(() => db.accounts.toArray().then((a) => a.sort((x, y) => x.createdAt - y.createdAt)), [])
  // the link to the page you're on is disabled: re-clicking it would reset the view (and drop ?month=)
  const path = useLocation({ select: (l) => l.pathname })
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 p-4">
          <Link to="/" disabled={path === '/'} className="text-lg font-bold tracking-tight aria-disabled:cursor-default">spendlook<span className="text-primary">.</span></Link>
          {accounts?.map((a) => (
            <Link key={a.id} to="/accounts/$accountId" params={{ accountId: a.id }} disabled={path === `/accounts/${a.id}`} className="kicker flex items-center gap-2 text-muted-foreground hover:text-foreground aria-disabled:cursor-default" activeProps={{ className: 'text-primary!' }}>
              <AccountLogo type={a.type} className="size-5" />{a.name}
            </Link>
          ))}
          <div className="ml-auto flex items-center gap-3">
            <Link to="/settings" disabled={path === '/settings'} className="kicker text-muted-foreground hover:text-foreground aria-disabled:cursor-default" activeProps={{ className: 'text-primary!' }}><Trans>Settings</Trans></Link>
            <ThemeToggle />
            <LocaleToggle />
          </div>
        </nav>
      </header>
      <p className="kicker border-b px-4 py-2 text-center text-[0.65rem] text-muted-foreground"><span className="text-primary">&gt; </span>
        <Trans>Your data stays in this browser only. Clearing site data deletes it, so export a backup in Settings.</Trans>
      </p>
      <main className="mx-auto max-w-6xl px-4 py-8"><Outlet /></main>
    </div>
  )
}

const rootRoute = createRootRoute({ component: Layout })
const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: AccountsPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/accounts/$accountId',
    component: AccountPage,
    // month + tab live in the URL so a refresh or shared link reopens the same view; defaults stay out of the URL
    validateSearch: (s: Record<string, unknown>): { month?: string; flow?: Flow } => ({
      month: typeof s.month === 'string' && /^\d{4}-\d{2}$/.test(s.month) ? s.month : undefined,
      flow: s.flow === 'income' ? 'income' : undefined,
    }),
  }),
  createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage }),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
