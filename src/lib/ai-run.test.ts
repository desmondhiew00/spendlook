import { expect, test } from 'bun:test'
import { currentAiRun, trackAiRun } from './ai-run'

test('one run at a time, progress visible, cleared even when the run throws', async () => {
  let release!: () => void
  const first = trackAiRun('recategorize', async (onProgress) => {
    onProgress(1, 3)
    await new Promise<void>((r) => (release = r))
  })
  expect(currentAiRun()).toEqual({ job: 'recategorize', done: 1, total: 3 })
  await expect(trackAiRun('categorize', async () => {})).rejects.toThrow()
  release()
  await first
  expect(currentAiRun()).toBeNull()

  await expect(
    trackAiRun('categorize', async () => {
      throw new Error('api')
    }),
  ).rejects.toThrow('api')
  expect(currentAiRun()).toBeNull()
})
