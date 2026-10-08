import { db } from './db'
import { AI_INCOME, AI_SPENDING, type Category, type CategoryDef, type CustomCategory, type Flow, INCOME, SPENDING } from './types'

export const MAX_CUSTOM = 20 // per flow: every one goes into each AI prompt
export const MAX_NAME = 40
export const MAX_HINT = 200
// fallbacks and parser-assigned categories: hiding them would leave rows nowhere to go
export const LOCKED: readonly Category[] = ['other', 'other_income', 'excluded', 'paypay', 'transfer_out']

export const isCustom = (c: string): c is CustomCategory => c.startsWith('c_')
export const foldOf = (flow: Flow): Category => (flow === 'expense' ? 'other' : 'other_income')

// Display order, which also fixes chart colour slots: built-ins, then custom by creation, then the fold bucket and excluded
export function categoryOrder(flow: Flow, defs: CategoryDef[]): Category[] {
  const builtins: readonly Category[] = flow === 'expense' ? SPENDING : INCOME
  const custom = defs
    .filter((d) => d.flow === flow && isCustom(d.id))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((d) => d.id)
  const i = builtins.indexOf(foldOf(flow))
  return [...builtins.slice(0, i), ...custom, ...builtins.slice(i)]
}

const hiddenSet = (defs: CategoryDef[]) => new Set(defs.filter((d) => d.hidden).map((d) => d.id))

// Picker options; a hidden category stays listed for a row that already has it
export function pickable(flow: Flow, defs: CategoryDef[], current?: Category): Category[] {
  const hidden = hiddenSet(defs)
  return categoryOrder(flow, defs).filter((c) => !hidden.has(c) || c === current)
}

export type AiCategories = Record<Flow, string[]> & { custom: CategoryDef[] }

export function aiCategories(defs: CategoryDef[]): AiCategories {
  const hidden = hiddenSet(defs)
  const custom = defs.filter((d) => isCustom(d.id) && !d.hidden).sort((a, b) => a.createdAt - b.createdAt)
  const of = (flow: Flow, builtins: readonly string[]) => [...builtins.filter((c) => !hidden.has(c as Category)), ...custom.filter((d) => d.flow === flow).map((d) => d.id)]
  return { expense: of('expense', AI_SPENDING), income: of('income', AI_INCOME), custom }
}

// Error key, or null when fine. taken = every other name shown in the same flow.
export function nameProblem(name: string, taken: string[]): 'empty' | 'long' | 'taken' | null {
  const n = name.trim()
  if (!n) return 'empty'
  if (n.length > MAX_NAME) return 'long'
  return taken.some((x) => x.trim().toLowerCase() === n.toLowerCase()) ? 'taken' : null
}

export async function addCategory(flow: Flow, name: string, hint?: string): Promise<CustomCategory> {
  const id: CustomCategory = `c_${crypto.randomUUID().slice(0, 8)}`
  await db.categories.add({ id, flow, name: name.trim(), hint: hint?.trim().slice(0, MAX_HINT) || undefined, createdAt: Date.now() })
  return id
}

// Rename, hint or hide. Creates the row the first time a built-in is touched.
export async function updateCategory(id: Category, flow: Flow, changes: Partial<Pick<CategoryDef, 'name' | 'hint' | 'hidden'>>) {
  if (changes.hidden && LOCKED.includes(id)) throw new Error(`${id} cannot be hidden`)
  await db.transaction('rw', db.categories, async () => {
    const row = (await db.categories.get(id)) ?? { id, flow, createdAt: Date.now() }
    await db.categories.put({ ...row, ...changes })
  })
}

export async function categoryUsage(id: CustomCategory) {
  const [txns, merchants] = await Promise.all([db.txns.filter((t) => t.overrideCategory === id).count(), db.merchants.filter((m) => m.overrideCategory === id || m.aiCategory === id).count()])
  return { txns, merchants }
}

// Rows in it move to Other: a user pick stays a user pick, an AI pick is flagged for review
export async function deleteCategory(id: CustomCategory) {
  await db.transaction('rw', [db.categories, db.txns, db.merchants], async () => {
    const def = await db.categories.get(id)
    if (!def) return
    const fold = foldOf(def.flow)
    const txns = await db.txns.filter((t) => t.overrideCategory === id).toArray()
    await db.txns.bulkUpdate(txns.map((t) => ({ key: t.id, changes: { overrideCategory: fold } })))
    const merchants = await db.merchants.filter((m) => m.overrideCategory === id || m.aiCategory === id).toArray()
    await db.merchants.bulkUpdate(
      merchants.map((m) => ({
        key: m.id,
        changes: { ...(m.overrideCategory === id && { overrideCategory: fold }), ...(m.aiCategory === id && { aiCategory: fold, needsReview: true }) },
      })),
    )
    await db.categories.delete(id)
  })
}
