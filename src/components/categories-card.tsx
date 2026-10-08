import { Trans, useLingui } from '@lingui/react/macro'
import { useLiveQuery } from 'dexie-react-hooks'
import { Eye, EyeOff, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { ConfirmDelete } from '@/components/confirm-delete'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { type Categories, useCategories } from '@/components/use-categories'
import { LOCKED, MAX_CUSTOM, MAX_HINT, MAX_NAME, addCategory, categoryUsage, deleteCategory, isCustom, nameProblem, updateCategory } from '@/lib/categories'
import type { BuiltinCategory, Category, CustomCategory, Flow } from '@/lib/types'

type Problem = ReturnType<typeof nameProblem>

// Add your own categories, rename or hide built-ins. Changes apply everywhere at once; existing merchants
// only move to a new category when the AI runs again or the user picks it.
export function CategoriesCard() {
  const { t } = useLingui()
  const cats = useCategories()
  const [flow, setFlow] = useState<Flow>('expense')
  const [nudge, setNudge] = useState(false)
  const list = cats.order(flow)
  const custom = list.filter(isCustom).length
  const takenBy = (c?: Category) => list.filter((x) => x !== c).map(cats.label)
  const problemText = (p: Problem) => (p === 'empty' ? t`Enter a name.` : p === 'long' ? t`Use ${MAX_NAME} characters or fewer.` : p === 'taken' ? t`A category with this name already exists.` : '')

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans>Manage categories</Trans>
        </CardTitle>
        <CardDescription>
          <Trans>Add your own categories, rename any category, or hide ones you never use. Hidden categories keep the transactions already in them.</Trans>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={flow} onValueChange={(v) => setFlow(v as Flow)}>
          <TabsList>
            <TabsTrigger value="expense">
              <Trans>Spending</Trans>
            </TabsTrigger>
            <TabsTrigger value="income">
              <Trans>Income</Trans>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <ul className="divide-y divide-border/70">
          {list.map((c) => (
            // keyed on the saved name so an outside change (another tab, a restore) resets the draft
            <CategoryRow
              key={`${c}:${cats.byId.get(c)?.name ?? ''}:${cats.byId.get(c)?.hint ?? ''}`}
              c={c}
              flow={flow}
              cats={cats}
              taken={takenBy(c)}
              problemText={problemText}
              onHint={() => setNudge(true)}
            />
          ))}
        </ul>
        {custom < MAX_CUSTOM ? (
          <AddCategory taken={takenBy()} problemText={problemText} onAdd={(name, hint) => addCategory(flow, name, hint).then(() => setNudge(true))} />
        ) : (
          <p className="text-sm text-muted-foreground">
            <Trans>You can add up to {MAX_CUSTOM} categories here.</Trans>
          </p>
        )}
        {nudge && (
          <p role="status" className="text-sm text-muted-foreground">
            <Trans>Merchants already categorized keep their category. Use Re-categorize all to let the AI use your changes.</Trans>
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// iOS-style row: reads as plain text until the pencil is pressed. Enter or Done saves, Escape cancels,
// and clicking away saves (same as the old always-editable inputs did on blur).
function CategoryRow({ c, flow, cats, taken, problemText, onHint }: { c: Category; flow: Flow; cats: Categories; taken: string[]; problemText: (p: Problem) => string; onHint: () => void }) {
  const { t } = useLingui()
  const def = cats.byId.get(c)
  const custom = isCustom(c)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(def?.name ?? '')
  const [hint, setHint] = useState(def?.hint ?? '')
  const [problem, setProblem] = useState<Problem>(null)
  const shown = cats.label(c)
  const original = custom ? undefined : cats.builtinLabel(c as BuiltinCategory)

  function cancel() {
    setName(def?.name ?? '')
    setHint(def?.hint ?? '')
    setProblem(null)
    setEditing(false)
  }

  function save() {
    const n = name.trim()
    const h = hint.trim()
    if (n !== (def?.name ?? '')) {
      // a built-in left blank goes back to its translated label
      if (!custom && !n) updateCategory(c, flow, { name: undefined })
      else {
        const p = nameProblem(n, taken)
        setProblem(p)
        if (p) return
        updateCategory(c, flow, { name: n })
      }
    }
    if (custom && h !== (def?.hint ?? '')) updateCategory(c, flow, { hint: h || undefined }).then(onHint)
    setProblem(null)
    setEditing(false)
  }

  if (editing)
    return (
      <li>
        <form
          className="space-y-2 py-3"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
          onKeyDown={(e) => e.key === 'Escape' && cancel()}
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && save()}
        >
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              aria-label={t`Name for ${shown}`}
              aria-invalid={!!problem}
              className="min-w-0 flex-1"
              value={name}
              placeholder={original}
              maxLength={MAX_NAME + 10}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" size="sm">
              <Trans>Done</Trans>
            </Button>
          </div>
          {custom && (
            <Input
              aria-label={t`AI hint for ${shown}`}
              className="text-xs"
              value={hint}
              placeholder={t`Optional hint for the AI, e.g. cafes and coffee chains`}
              maxLength={MAX_HINT}
              onChange={(e) => setHint(e.target.value)}
            />
          )}
          {!custom && def?.name && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 text-muted-foreground"
              onClick={() => {
                updateCategory(c, flow, { name: undefined })
                setEditing(false)
              }}
            >
              <RotateCcw data-icon="inline-start" />
              <Trans>Reset to “{original}”</Trans>
            </Button>
          )}
          {problem && (
            <p role="alert" className="text-xs text-destructive">
              {problemText(problem)}
            </p>
          )}
        </form>
      </li>
    )

  const hidden = !!def?.hidden
  const sub = custom ? def?.hint : def?.name ? t`Renamed from ${original}` : undefined
  return (
    <li className="flex min-h-12 items-center gap-1 py-1.5">
      <div className={`min-w-0 flex-1 ${hidden ? 'opacity-45' : ''}`}>
        <div className="truncate">{shown}</div>
        {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
      </div>
      {hidden && (
        <span className="mr-1 text-xs text-muted-foreground">
          <Trans>Hidden</Trans>
        </span>
      )}
      <Button variant="ghost" size="icon-sm" aria-label={t`Edit ${shown}`} title={t`Edit`} className="text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)}>
        <Pencil />
      </Button>
      {!LOCKED.includes(c) && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-pressed={hidden}
          aria-label={hidden ? t`Show ${shown}` : t`Hide ${shown}`}
          title={hidden ? t`Show` : t`Hide`}
          className="text-muted-foreground hover:text-foreground"
          onClick={() => updateCategory(c, flow, { hidden: !hidden })}
        >
          {hidden ? <EyeOff /> : <Eye />}
        </Button>
      )}
      {custom && (
        <ConfirmDelete
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={t`Delete ${shown}`} title={t`Delete ${shown}`} className="text-muted-foreground hover:text-destructive">
              <Trash2 />
            </Button>
          }
          title={<Trans>Delete “{shown}”?</Trans>}
          description={<UsageText id={c} fold={cats.label(flow === 'expense' ? 'other' : 'other_income')} />}
          confirmLabel={<Trans>Delete category</Trans>}
          onConfirm={() => deleteCategory(c)}
        />
      )}
    </li>
  )
}

// mounts only while the dialog is open, so rows are counted on demand
function UsageText({ id, fold }: { id: CustomCategory; fold: string }) {
  const n = useLiveQuery(() => categoryUsage(id), [id])
  if (!n) return <Trans>Counting…</Trans>
  return (
    <Trans>
      {n.merchants} merchants and {n.txns} transactions in it move to {fold}. Categories the AI picked are flagged for review.
    </Trans>
  )
}

function AddCategory({ taken, problemText, onAdd }: { taken: string[]; problemText: (p: Problem) => string; onAdd: (name: string, hint: string) => Promise<unknown> }) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [hint, setHint] = useState('')
  const [problem, setProblem] = useState<Problem>(null)

  function close() {
    setName('')
    setHint('')
    setProblem(null)
    setOpen(false)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const p = nameProblem(name, taken)
    setProblem(p)
    if (p) return
    await onAdd(name, hint)
    close()
  }

  if (!open)
    return (
      <Button variant="ghost" className="-ml-2 text-primary hover:text-primary" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        <Trans>Add category</Trans>
      </Button>
    )

  return (
    <form onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && close()} className="space-y-2 rounded-xl bg-muted/60 p-3">
      <Input
        autoFocus
        aria-label={t`New category name`}
        placeholder={t`New category`}
        aria-invalid={!!problem}
        className="bg-card"
        value={name}
        maxLength={MAX_NAME + 10}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        aria-label={t`AI hint for the new category`}
        placeholder={t`Optional hint for the AI, e.g. cafes and coffee chains`}
        className="bg-card text-xs"
        value={hint}
        maxLength={MAX_HINT}
        onChange={(e) => setHint(e.target.value)}
      />
      {problem && (
        <p role="alert" className="text-xs text-destructive">
          {problemText(problem)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={close}>
          <Trans>Cancel</Trans>
        </Button>
        <Button type="submit" size="sm" disabled={!name.trim()}>
          <Trans>Add</Trans>
        </Button>
      </div>
    </form>
  )
}
