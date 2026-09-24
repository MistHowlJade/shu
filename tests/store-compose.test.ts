import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../src/renderer/src/store'

describe('store 切片组合', () => {
  it('六个切片的状态与动作都挂载在同一个 store 上', () => {
    const s = useStore.getState()
    /* base:应用骨架 */
    expect(s.view).toBe('library')
    expect(typeof s.openBookAt).toBe('function')
    expect(typeof s.exportTxt).toBe('function')
    /* chapters:章节 */
    expect(s.chapter).toBeNull()
    expect(typeof s.restoreHistory).toBe('function')
    /* codex:设定中心 */
    expect(s.nameCandidates).toEqual([])
    expect(typeof s.extractItemsFromChapter).toBe('function')
    /* ai:生成 */
    expect(s.aiRunning).toBe(false)
    expect(typeof s.runAutoWrite).toBe('function')
    /* inspire:灵感陪聊 */
    expect(s.inspire.msgs).toEqual([])
    expect(typeof s.insertInspire).toBe('function')
    /* importer:扫书 */
    expect(s.importer.status).toBe('idle')
    expect(typeof s.applyScanToBook).toBe('function')
  })
})

describe('showToast', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('提示 3.5 秒后自动消失;新提示覆盖旧提示', async () => {
    vi.useFakeTimers()
    const { showToast } = useStore.getState()
    showToast('第一条', 'error')
    expect(useStore.getState().toast).toMatchObject({ kind: 'error', message: '第一条' })
    showToast('第二条')
    expect(useStore.getState().toast).toMatchObject({ kind: 'info', message: '第二条' })
    await vi.advanceTimersByTimeAsync(3600)
    expect(useStore.getState().toast).toBeNull()
  })
})
