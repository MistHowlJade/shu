import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadInspire, persistInspire, type InspireMsg } from '../src/renderer/src/slices/types'

const mem = new Map<string, string>()

beforeEach(() => {
  mem.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function msgs(n: number): InspireMsg[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    role: i % 2 ? ('assistant' as const) : ('user' as const),
    content: `消息${i}`
  }))
}

describe('灵感对话持久化', () => {
  it('写入后能按书读回,忙碌/流式状态复位', () => {
    persistInspire('D:/books/a', msgs(3))
    const state = loadInspire('D:/books/a')
    expect(state.msgs).toHaveLength(3)
    expect(state.msgs[2].content).toBe('消息2')
    expect(state.busy).toBe(false)
    expect(state.stream).toBe('')
    expect(state.error).toBeNull()
  })

  it('只保留最近 100 条,防止超限', () => {
    persistInspire('D:/books/a', msgs(120))
    const state = loadInspire('D:/books/a')
    expect(state.msgs).toHaveLength(100)
    expect(state.msgs[0].id).toBe('m20')
    expect(state.msgs[99].id).toBe('m119')
  })

  it('清空对话删除存储键;不同书的对话互不干扰', () => {
    persistInspire('D:/books/a', msgs(2))
    persistInspire('D:/books/b', msgs(2))
    persistInspire('D:/books/a', [])
    expect(loadInspire('D:/books/a').msgs).toHaveLength(0)
    expect(loadInspire('D:/books/b').msgs).toHaveLength(2)
  })

  it('存储内容损坏时安全回退为空对话', () => {
    mem.set('ai-novel:inspire:D:/books/a', '{oops')
    expect(loadInspire('D:/books/a').msgs).toHaveLength(0)
    mem.set('ai-novel:inspire:D:/books/b', '"not-an-array"')
    expect(loadInspire('D:/books/b').msgs).toHaveLength(0)
  })

  it('bookDir 为空时放弃持久化', () => {
    persistInspire(null, msgs(2))
    expect(mem.size).toBe(0)
  })
})
