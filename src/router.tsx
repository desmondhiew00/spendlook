import { Trans } from '@lingui/react/macro'
import { Link, Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { LocaleToggle } from '@/components/locale-toggle'
import { db } from '@/lib/db'
import { AccountPage } from '@/routes/account'
import { AccountsPage } from '@/routes/accounts'
import { SettingsPage } from '@/routes/settings'

function Layout() {
  const accounts = useLiveQuery(() => db.accounts.toArray().then((a) => a.sort((x, y) => x.createdAt - y.createdAt)), [])
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 p-4">
          <Link to="/" className="text-lg font-bold tracking-tight">spendlook<span className="text-primary">.</span></Link>
          {accounts?.map((a) => (
            <Link key={a.id} to="/accounts/$accountId" params={{ accountId: a.id }} className="kicker text-muted-foreground hover:text-foreground" activeProps={{ className: 'text-primary!' }}>
              {a.name}
            </Link>
          ))}
          <div className="ml-auto flex items-center gap-3">
            <Link to="/settings" className="kicker text-muted-foreground hover:text-foreground" activeProps={{ className: 'text-primary!' }}><Trans>Settings</Trans></Link>
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
  createRoute({ getParentRoute: () => rootRoute, path: '/accounts/$accountId', component: AccountPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage }),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
