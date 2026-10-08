import { useSyncExternalStore } from 'react'

// The AI run in progress, kept outside components: a run outlives the page that started it, so coming back
// must show its progress and must not start a second, double-billed run alongside it.
export type AiRun = { job: 'categorize' | 'recategorize'; done: number; total: number } | null

let run: AiRun = null
const subs = new Set<() => void>()
const set = (r: AiRun) => {
  run = r
  subs.forEach((f) => f())
}

export const currentAiRun = () => run
export const useAiRun = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), currentAiRun)

// closing or reloading the tab kills the run; finished batches are saved, so this only asks
const warn = (e: BeforeUnloadEvent) => e.preventDefault()

export async function trackAiRun<T>(job: 'categorize' | 'recategorize', fn: (onProgress: (done: number, total: number) => void) => Promise<T>): Promise<T> {
  if (run) throw new Error('An AI run is already in progress')
  set({ job, done: 0, total: 0 })
  addEventListener('beforeunload', warn)
  try {
    return await fn((done, total) => set({ job, done, total }))
  } finally {
    removeEventListener('beforeunload', warn)
    set(null)
  }
}
