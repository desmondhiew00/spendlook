// Seeds a fake bank account and captures README / landing screenshots in light and dark.
// bun run screenshots  →  docs/screenshots/*.png (README) + src/assets/screenshots/*.webp (landing page)
// The WebP step needs ImageMagick (`brew install imagemagick`).
import { mkdir } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'

const PORT = 5199
const BASE = `http://localhost:${PORT}`
const OUT = 'docs/screenshots'
const WEB = 'src/assets/screenshots'
const ACCOUNT = 'demo'
const MONTHS = 12
const LAST = new Date(2026, 8) // Sep 2026; the newest month shown

// seeded PRNG so every run draws the same numbers
let seed = 42
const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
const between = (lo: number, hi: number) => Math.round((lo + rand() * (hi - lo)) / 10) * 10
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]

type Row = { date: string; kind: 'expense' | 'income'; amount: number; raw: string; category: string }

// [merchant, category, times per month, min, max]
const SPENDING: [string[], string, number, number, number][] = [
  [['LIFE SUPERMARKET', 'SUMMIT STORE', 'OZEKI'], 'groceries', 10, 1200, 6500],
  [['STARBUCKS COFFEE', 'YOSHINOYA', 'SAIZERIYA', 'SUSHIRO', 'MOS BURGER'], 'dining', 8, 600, 4800],
  [['SUICA CHARGE'], 'transport', 3, 3000, 5000],
  [['TOKYO ELECTRIC POWER'], 'utilities', 1, 6000, 12000],
  [['TOKYO GAS'], 'utilities', 1, 3000, 7500],
  [['DOCOMO'], 'phone_internet', 1, 7480, 7480],
  [['AMAZON.CO.JP', 'UNIQLO', 'MUJI'], 'shopping', 4, 1500, 14000],
  [['NETFLIX.COM'], 'subscriptions', 1, 1490, 1490],
  [['SPOTIFY'], 'subscriptions', 1, 980, 980],
  [['MATSUMOTO KIYOSHI'], 'health', 2, 800, 4500],
  [['TOHO CINEMAS'], 'entertainment', 1, 2000, 4000],
]

function generate(): Row[] {
  const rows: Row[] = []
  for (let i = MONTHS - 1; i >= 0; i--) {
    const d = new Date(LAST.getFullYear(), LAST.getMonth() - i)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    const day = (n: number) => `${ym}-${String(Math.min(n, days)).padStart(2, '0')}`
    const add = (n: number, kind: Row['kind'], raw: string, category: string, amount: number) => rows.push({ date: day(n), kind, amount, raw, category })
    add(27, 'expense', 'SAKURA REALTY RENT', 'rent', 92000)
    for (const [names, category, times, lo, hi] of SPENDING) {
      // a little month-to-month wobble in how often you go
      const n = Math.max(1, Math.round(times * (0.7 + rand() * 0.6)))
      for (let k = 0; k < n; k++) add(1 + Math.floor(rand() * days), 'expense', pick(names), category, between(lo, hi))
    }
    const m = d.getMonth() + 1
    if (m === 8 || m === 12) add(10, 'expense', pick(['JAL', 'ANA', 'JALAN NET']), 'travel', between(45000, 90000))
    add(25, 'income', 'ACME (KA SALARY', 'salary', 320000)
    if (m === 6 || m === 12) add(10, 'income', 'ACME (KA BONUS', 'bonus', 450000)
    if (rand() < 0.4) add(15, 'income', 'PAYPAY POINTS', 'cashback_points', between(300, 2000))
    if (m === 3 || m === 9) add(20, 'income', 'INTEREST', 'interest', between(5, 40))
  }
  return rows
}

async function seedDb(page: Page, rows: Row[]) {
  await page.evaluate(
    async ({ rows, account }) => {
      // the app's own db and key rules, served by the dev server
      const { db } = await import('/src/lib/db.ts')
      const { normalizeMerchant } = await import('/src/lib/normalize.ts')
      const uploadId = 'demo-upload' // fresh browser context, so the db starts empty
      await db.accounts.put({ id: account, type: 'mufg', name: 'Everyday bank', currency: 'JPY', createdAt: Date.now() })
      await db.uploads.put({ id: uploadId, accountId: account, fileName: 'statement.csv', createdAt: Date.now(), added: rows.length, skipped: 0 })
      const merchants = new Map()
      const txns = rows.map((r, i) => {
        const merchantKey = normalizeMerchant(r.raw)
        merchants.set(`${r.kind}|${merchantKey}`, {
          id: `${r.kind}|${merchantKey}`,
          kind: r.kind,
          merchantKey,
          displayName: r.raw.replace(/ \(KA.*/, '').replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()),
          aiCategory: r.category,
          needsReview: false,
        })
        const key = `${r.date}:${i}`
        return { id: `${account}:${key}`, key, accountId: account, uploadId, month: r.date.slice(0, 7), date: r.date, kind: r.kind, amount: r.amount, rawMerchant: r.raw, merchantKey }
      })
      await db.merchants.bulkPut([...merchants.values()])
      await db.txns.bulkPut(txns)
    },
    { rows, account: ACCOUNT },
  )
}

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(BASE).then(
        (r) => r.ok,
        () => false,
      )
    )
      return
    await Bun.sleep(200)
  }
  throw new Error(`dev server never came up on ${BASE}`)
}

const server = Bun.spawn(['node_modules/.bin/vite', '--port', String(PORT), '--strictPort'], { stdout: 'ignore', stderr: 'inherit' })
const browser = await chromium.launch()
try {
  await waitForServer()
  await mkdir(OUT, { recursive: true })
  await mkdir(WEB, { recursive: true })
  const rows = generate()
  for (const theme of ['light', 'dark'] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce' })
    await ctx.addInitScript((t) => {
      localStorage.setItem('theme', t)
      localStorage.setItem('locale', 'en')
    }, theme)
    const page = await ctx.newPage()
    await page.goto(BASE)
    await seedDb(page, rows)
    await page.goto(`${BASE}/accounts/${ACCOUNT}`)
    await page.getByText('By category per month').waitFor()
    await page.waitForTimeout(800) // chart animation
    // crop just below the chart card, inside the 24px gap so the next cards stay out
    const chart = (await page.locator('[data-slot=card]', { hasText: 'By category per month' }).boundingBox())!
    await page.screenshot({ path: `${OUT}/dashboard-${theme}.png`, clip: { x: 0, y: 0, width: 1280, height: chart.y + chart.height + 16 } })
    // landing copy: 1600px wide is sharp at the hero's max width on 2x screens, at a fraction of the PNG
    const webp = Bun.spawnSync(['magick', `${OUT}/dashboard-${theme}.png`, '-resize', '1600x', '-quality', '82', `${WEB}/dashboard-${theme}.webp`], { stderr: 'inherit' })
    if (!webp.success) throw new Error('magick failed; is ImageMagick installed?')

    await page.getByRole('checkbox', { name: 'Cash flow' }).click()
    await page.waitForTimeout(800)
    const card = page.locator('[data-slot=card]', { hasText: 'Cash flow per month' })
    await card.screenshot({ path: `${OUT}/cash-flow-${theme}.png` })
    await ctx.close()
  }
  console.log(`saved to ${OUT}/`)
} finally {
  await browser.close()
  server.kill()
}
