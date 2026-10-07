import { useLingui } from '@lingui/react'
import { useLingui as useT } from '@lingui/react/macro'
import { cn } from 'cn'
import { Settings } from 'lucide-react'
import { Trans } from '@lingui/react/macro'
import { Link, Outlet, createRootRoute, createRoute, createRouter, lazyRouteComponent, useLocation } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { AccountLogo } from '@/components/account-logo'
import { buttonVariants } from '@/components/ui/button'
import { LocaleToggle } from '@/components/locale-toggle'
import { LogoMark } from '@/components/logo-mark'
import { ThemeToggle } from '@/components/theme-toggle'
import { db } from '@/lib/db'
import type { Flow } from '@/lib/types'
import { AccountsPage } from '@/routes/accounts'

function Layout() {
  const accounts = useLiveQuery(() => db.accounts.toArray().then((a) => a.sort((x, y) => x.createdAt - y.createdAt)), [])
  // the link to the page you're on is disabled: re-clicking it would reset the view (and drop ?month=)
  const path = useLocation({ select: (l) => l.pathname })
  const home = useLingui().i18n.locale === 'ja' ? '/ja' : '/'
  const { t } = useT()
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 p-4">
          <Link to={home} disabled={path === home} className="flex items-center gap-2 text-lg font-bold tracking-tight aria-disabled:cursor-default"><LogoMark className="size-6" />spendlook<span className="-ml-2 text-primary">.</span></Link>
          {accounts?.map((a) => (
            <Link key={a.id} to="/accounts/$accountId" params={{ accountId: a.id }} disabled={path === `/accounts/${a.id}`} className="kicker flex items-center gap-2 text-muted-foreground hover:text-foreground aria-disabled:cursor-default" activeProps={{ className: 'text-primary!' }}>
              <AccountLogo type={a.type} className="size-5" />{a.name}
            </Link>
          ))}
          <div className="ml-auto flex items-center gap-3">
            <Link to="/settings" disabled={path === '/settings'} aria-label={t`Settings`} title={t`Settings`} className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'text-muted-foreground hover:text-foreground aria-disabled:cursor-default')} activeProps={{ className: 'text-primary!' }}><Settings /></Link>
            <ThemeToggle />
            <LocaleToggle />
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8"><Outlet /></main>
      {/* read once, then out of the way; Settings repeats it next to the backup buttons where it's actionable */}
      <footer className="kicker border-t px-4 py-2 text-center text-[0.65rem] text-muted-foreground bg-card"><span className="text-primary">&gt; </span>
        <Trans>Your data stays in this browser only. Clearing site data deletes it, so export a backup in Settings.</Trans>
        {/* static pages outside the SPA: plain links, full page load */}
        <span className="ml-3 inline-flex gap-3"><a href="/privacy" className="underline hover:text-foreground"><Trans>Privacy</Trans></a><a href="/terms" className="underline hover:text-foreground"><Trans>Terms</Trans></a></span>
      </footer>
    </div>
  )
}

const rootRoute = createRootRoute({ component: Layout })
const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: AccountsPage }),
  // Japanese landing URL: same page, ja head tags come from ja.html
  createRoute({ getParentRoute: () => rootRoute, path: '/ja', component: AccountsPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/accounts/$accountId',
    // split out: the dashboard pulls in echarts
    component: lazyRouteComponent(() => import('@/routes/account'), 'AccountPage'),
    // month + tab live in the URL so a refresh or shared link reopens the same view; defaults stay out of the URL
    validateSearch: (s: Record<string, unknown>): { month?: string; flow?: Flow } => ({
      month: typeof s.month === 'string' && /^\d{4}-\d{2}$/.test(s.month) ? s.month : undefined,
      flow: s.flow === 'income' ? 'income' : undefined,
    }),
  }),
  createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: lazyRouteComponent(() => import('@/routes/settings'), 'SettingsPage') }),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
