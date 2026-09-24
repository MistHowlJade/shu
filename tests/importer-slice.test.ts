import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scanSignature, useStore, type ImporterState } from '../src/renderer/src/store'
import type { AiResult, Book } from '../src/shared/types'

const CHUNK = 4500
/* 恰好切成 3 段的文本:每段 4500 字、无换行,chunkText 不会在段中折断 */
const TEXT3 = 'a'.repeat(CHUNK) + 'b'.repeat(CHUNK) + 'c'.repeat(CHUNK)

function okScan(payload: unknown): AiResult {
  return { ok: true, text: JSON.stringify(payload) }
}
function failScan(error: string): AiResult {
  return { ok: false, error }
}

function makeImporter(partial: Partial<ImporterState> = {}): ImporterState {
  return {
    fileName: '书.txt',
    text: TEXT3,
    status: 'idle',
    progressCurrent: 0,
    progressTotal: 0,
    log: [],
    stop: false,
    currentRequestId: null,
    limitWan: 0,
    worldMode: 'append',
    resumeIndex: 0,
    resumeSig: '',
    failedChunks: [],
    results: { worldviewText: '', realms: [], items: [], characters: [] },
    ...partial
  }
}

function makeBook(): Book {
  return {
    id: 'b1',
    title: '测试书',
    author: '作者',
    genre: '玄幻',
    description: '',
    style: '',
    volumes: [],
    chapters: [],
    characters: [],
    items: [],
    worldview: { setting: '', powerSystem: '', goldenFinger: '', factions: '', notes: '' },
    createdAt: 0,
    updatedAt: 0
  }
}

let scanChunk: ReturnType<typeof vi.fn>
let abort: ReturnType<typeof vi.fn>
let saveBook: ReturnType<typeof vi.fn>

beforeEach(() => {
  scanChunk = vi.fn()
  abort = vi.fn(async () => {})
  saveBook = vi.fn(async (_dir: string, draft: Book) => draft)
  vi.stubGlobal('window', {
    api: {
      ai: { scanChunk, abort },
      books: { save: saveBook },
      importer: { openTxt: vi.fn(async () => null), fetchUrl: vi.fn(async () => ({ ok: false })) }
    }
  })
  useStore.setState({ bookDir: 'D:/books/测试书', book: makeBook(), importer: makeImporter() })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('startScan 扫描状态机', () => {
  it('从头扫描:逐段处理、跨段去重合并、完成清断点', async () => {
    scanChunk.mockImplementation(({ chunk }: { chunk: string }) => {
      if (chunk.startsWith('a')) {
        return Promise.resolve(
          okScan({
            worldview: '灵气复苏的大陆',
            realms: ['练气'],
            items: [{ name: '飞剑' }],
            characters: [{ name: '张三', role: '主角' }]
          })
        )
      }
      if (chunk.startsWith('b')) {
        /* 与 a 段重复的境界/人物应去重,只留下新的 */
        return Promise.resolve(
          okScan({
            realms: ['练气', '金丹'],
            items: [{ name: '飞剑' }, { name: '储物袋' }],
            characters: [{ name: '张三', role: '主角' }, { name: '李四', role: '反派' }]
          })
        )
      }
      return Promise.resolve(okScan({}))
    })

    await useStore.getState().startScan()

    const imp = useStore.getState().importer
    expect(scanChunk).toHaveBeenCalledTimes(3)
    expect(imp.status).toBe('idle')
    expect(imp.results.realms).toEqual(['练气', '金丹'])
    expect(imp.results.items.map((i) => i.name)).toEqual(['飞剑', '储物袋'])
    expect(imp.results.characters.map((c) => c.name)).toEqual(['张三', '李四'])
    expect(imp.results.worldviewText).toContain('灵气复苏')
    /* 全部扫完且无失败:断点与失败清单清零 */
    expect(imp.resumeIndex).toBe(0)
    expect(imp.resumeSig).toBe('')
    expect(imp.failedChunks).toEqual([])
  })

  it('中途停止:保留断点,继续扫描从断点接着扫', async () => {
    let resolve0!: (v: AiResult) => void
    let resolve1!: (v: AiResult) => void
    scanChunk
      .mockImplementationOnce(() => new Promise<AiResult>((r) => (resolve0 = r)))
      .mockImplementationOnce(() => new Promise<AiResult>((r) => (resolve1 = r)))
      .mockImplementation(() => Promise.resolve(okScan({ realms: ['金丹'] })))

    const scanning = useStore.getState().startScan()
    await vi.waitFor(() => expect(scanChunk).toHaveBeenCalledTimes(1))
    resolve0(okScan({ realms: ['练气'] }))
    /* 第 1 段落账、第 2 段开扫后叫停 */
    await vi.waitFor(() => expect(scanChunk).toHaveBeenCalledTimes(2))
    await useStore.getState().stopScan()
    resolve1(okScan({ realms: ['元婴'] }))
    await scanning

    const imp = useStore.getState().importer
    expect(imp.status).toBe('idle')
    expect(imp.stop).toBe(true)
    expect(imp.resumeIndex).toBe(1)
    expect(imp.resumeSig).toBe(scanSignature(imp, TEXT3))
    expect(imp.failedChunks).toEqual([])
    /* 被叫停那段的返回不并入结果 */
    expect(imp.results.realms).toEqual(['练气'])

    /* 继续扫描:只扫剩下的第 2、3 段,扫完清断点 */
    const before = scanChunk.mock.calls.length
    await useStore.getState().startScan()
    expect(scanChunk.mock.calls.length - before).toBe(2)
    expect(scanChunk.mock.calls.slice(before).map((c) => c[0].chunk)).toEqual([
      'b'.repeat(CHUNK),
      'c'.repeat(CHUNK)
    ])
    const done = useStore.getState().importer
    expect(done.resumeIndex).toBe(0)
    expect(done.resumeSig).toBe('')
    expect(done.results.realms).toEqual(['练气', '金丹'])
  })

  it('补扫失败段:只重扫失败的段落,成功后清除断点', async () => {
    const imp = makeImporter({ text: TEXT3, resumeIndex: 3, failedChunks: [1] })
    imp.resumeSig = scanSignature(imp, TEXT3)
    useStore.setState({ importer: imp })
    scanChunk.mockImplementation(() => Promise.resolve(okScan({ realms: ['元婴'] })))

    await useStore.getState().startScan()

    expect(scanChunk).toHaveBeenCalledTimes(1)
    expect(scanChunk.mock.calls[0][0].chunk).toBe('b'.repeat(CHUNK))
    const after = useStore.getState().importer
    expect(after.failedChunks).toEqual([])
    expect(after.resumeIndex).toBe(0)
    expect(after.results.realms).toEqual(['元婴'])
  })

  it('限流重试:整段失败记入失败清单,自动补扫成功后清零', async () => {
    vi.useFakeTimers()
    let calls = 0
    scanChunk.mockImplementation(() => {
      calls++
      if (calls === 1) return Promise.resolve(okScan({ realms: ['练气'] })) /* 第 1 段 */
      if (calls <= 5) return Promise.resolve(failScan('429 限流')) /* 第 2 段 4 次全失败 */
      if (calls === 6) return Promise.resolve(okScan({ realms: ['化神'] })) /* 第 3 段 */
      return Promise.resolve(okScan({ realms: ['金丹'] })) /* 补扫第 2 段成功 */
    })

    const scanning = useStore.getState().startScan()
    await vi.runAllTimersAsync()
    await scanning

    const imp = useStore.getState().importer
    expect(scanChunk).toHaveBeenCalledTimes(7)
    expect(imp.failedChunks).toEqual([])
    expect(imp.resumeIndex).toBe(0)
    expect(imp.status).toBe('idle')
    expect(imp.results.realms).toEqual(['练气', '化神', '金丹'])
    expect(imp.log.some((l) => l.includes('重试'))).toBe(true)
    expect(imp.log.some((l) => l.includes('补扫'))).toBe(true)
  })
})

describe('applyScanToBook 写入当前书', () => {
  it('把扫描结果合并进 book 并通过 books.save 落盘', async () => {
    useStore.setState({
      importer: makeImporter({
        results: {
          worldviewText: '· 灵气复苏',
          realms: ['练气'],
          items: [{ name: '飞剑', category: '武器', grade: '下品', effect: '斩妖', origin: '锻造', location: '剑冢' }],
          characters: [{ name: '张三', role: '主角' }]
        }
      })
    })

    await useStore.getState().applyScanToBook()

    expect(saveBook).toHaveBeenCalledTimes(1)
    const book = useStore.getState().book!
    expect(book.items).toHaveLength(1)
    expect(book.items[0]).toMatchObject({ name: '飞剑', category: '武器', stage: '扫书导入' })
    expect(book.characters[0]).toMatchObject({ name: '张三', role: '主角' })
    expect(book.worldview.powerSystem).toBe('练气')
    expect(book.worldview.setting).toContain('灵气复苏')
  })

  it('没有可写入的新内容时不写盘', async () => {
    const book = makeBook()
    book.items.push({
      id: 'i1',
      name: '飞剑',
      category: '',
      grade: '',
      appearance: '',
      effect: '',
      origin: '',
      location: '',
      owner: '',
      stage: '',
      notes: ''
    })
    book.characters.push({ id: 'c1', name: '张三', role: '', personality: '', background: '', arc: '', notes: '' })
    useStore.setState({
      book,
      importer: makeImporter({
        results: {
          worldviewText: '',
          realms: [],
          items: [{ name: '飞剑', category: '', grade: '', effect: '', origin: '', location: '' }],
          characters: [{ name: '张三', role: '' }]
        }
      })
    })

    await useStore.getState().applyScanToBook()

    expect(saveBook).not.toHaveBeenCalled()
    expect(useStore.getState().book!.items).toHaveLength(1)
  })
})
