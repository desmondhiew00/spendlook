import { useLingui } from '@lingui/react/macro'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { CATEGORY_LABEL } from '@/components/category-label'
import { categoryOrder, pickable } from '@/lib/categories'
import { db } from '@/lib/db'
import type { BuiltinCategory, Category, CategoryDef, Flow } from '@/lib/types'

const NONE: CategoryDef[] = []

export type Categories = ReturnType<typeof useCategories>

// Labels and lists with the user's custom, renamed and hidden categories applied
export function useCategories() {
  const { i18n } = useLingui()
  const defs = useLiveQuery(() => db.categories.toArray(), [], NONE)
  return useMemo(() => {
    const byId = new Map(defs.map((d) => [d.id, d]))
    const builtinLabel = (c: BuiltinCategory) => i18n._(CATEGORY_LABEL[c])
    // an unknown id only shows up if a custom category vanished outside the app
    const label = (c: Category) => byId.get(c)?.name ?? (c in CATEGORY_LABEL ? builtinLabel(c as BuiltinCategory) : c)
    return {
      defs,
      byId,
      label,
      builtinLabel,
      order: (flow: Flow) => categoryOrder(flow, defs),
      options: (flow: Flow, current?: Category) => pickable(flow, defs, current),
    }
  }, [defs, i18n])
}
