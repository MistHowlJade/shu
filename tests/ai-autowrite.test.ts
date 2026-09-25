import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/shared/types'
import { useStore } from '../src/renderer/src/store'
import type { Book, Chapter, ChapterMeta } from '../src/shared/types'

const calls = { generate: [] as string[], savedFiles: [] as string[] }

function meta(id: string, status: 'todo' | 'draft' | 'done', wordCount: number): ChapterMeta {
  return { id, volumeId: 'v1', file: id + '.json', title: id, status, wordCount, hasSummary: false, updatedAt: 1 }
}

const contents: Record<string, string> = {}

function setupBook(): void {
  calls.generate.length = 0
  calls.savedFiles.length = 0
  contents.chA = 'A'.repeat(1000)
  contents.chB = 'B'.repeat(800)
  contents.chC = ''
  contents.chD = ''
  const metas = [meta('chA', 'done', 1000), meta('chB', 'draft', 800), meta('chC', 'todo', 0), meta('chD', 'todo', 0)]
  const book: Book = {
    id: 'b1',
    title: '书',
    author: '',
    genre: '',
    description: '',
    style: '',
    volumes: [{ id: 'v1', title: 'V', summary: '' }],
    chapters: metas,
    characters: [],
    worldview: { setting: '', powerSystem: '', goldenFinger: '', factions: '', notes: '' },
    items: [],
    createdAt: 1,
    updatedAt: 1
  }
  useStore.setState({ book, bookDir: 'D:/mock', chapter: null, content: '', dirty: false, aiOutput: '', aiError: null })
}

beforeEach(() => {
  setupBook()
  vi.stubGlobal('window', {
    api: {
      settings: { load: async () => ({ ...DEFAULT_SETTINGS }), save: async () => true },
      books: {
        save: async (_d: string, book: Book) => book,
        backup: async () => ({ skipped: true, reason: 'recent' })
      },
      chapters: {
        read: async (_d: string, id: string) => ({
          id,
          volumeId: 'v1',
          title: id,
          outline: '',
          content: contents[id] ?? '',
          summary: '',
          createdAt: 1,
          updatedAt: 1
        }),
        save: async (_d: string, chapter: Chapter) => {
          calls.savedFiles.push(chapter.id)
          const wc = chapter.content.replace(/\s/g, '').length
          return {
            chapter,
            meta: {
              id: chapter.id,
              volumeId: chapter.volumeId,
              file: chapter.id + '.json',
              title: chapter.title,
              status: wc > 0 ? 'draft' : 'todo',
              wordCount: wc,
              hasSummary: !!chapter.summary,
              updatedAt: Date.now()
            } as ChapterMeta
          }
        },
        remove: async () => true
      },
      ai: {
        onDelta: () => () => {},
        generateChapter: async (input: { chapterId: string }) => {
          calls.generate.push(input.chapterId)
          return { ok: true, text: '生成的正文' }
        },
        summarize: async (input: { chapterId: string }) => {
          /* 主进程 summarize 会直接落盘摘要 */
          calls.savedFiles.push(input.chapterId)
          return { ok: true, text: '摘要' }
        },
        scanChapter: async () => ({
          ok: true,
          newCharacters: 0,
          newItems: 0,
          newRealms: 0,
          worldAdded: false,
          addedCharacters: [],
          addedItems: [],
          addedRealms: [],
          addedWorldLines: []
        }),
        abort: async () => true
      },
      app: { flush: () => {}, setThemeColors: async () => true }
    }
  })
})

describe('自动连写边界', () => {
  it('只写「待写且字数为 0」的章,手写/已完成章一律跳过', async () => {
    await useStore.getState().runAutoWrite(5)

    /* 只生成 chC、chD 两章 */
    expect(calls.generate).toEqual(['chC', 'chD'])
    /* 每章:生成正文保存一次 + 摘要保存一次 */
    expect(calls.savedFiles.filter((id) => id === 'chC').length).toBe(2)
    expect(calls.savedFiles.filter((id) => id === 'chD').length).toBe(2)
    /* 手写章 chB 完全没被碰 */
    expect(calls.savedFiles.filter((id) => id === 'chB').length).toBe(0)
    expect(useStore.getState().book?.chapters.find((c) => c.id === 'chB')?.wordCount).toBe(800)
    expect(useStore.getState().autoWrite).toBeNull()
  })

  it('没有可写空章时提示错误且不启动', async () => {
    useStore.setState((s) => ({
      book: s.book
        ? {
            ...s.book,
            chapters: s.book.chapters.map((c) => (c.id === 'chC' || c.id === 'chD' ? { ...c, status: 'done', wordCount: 10 } : c))
          }
        : null
    }))
    await useStore.getState().runAutoWrite(3)
    expect(calls.generate).toEqual([])
    expect(useStore.getState().autoWrite).toBeNull()
    expect(useStore.getState().toast?.kind).toBe('error')
  })
})

describe('章节删除边界', () => {
  it('删除当前章:选中回落到第一章,内容同步切换', async () => {
    await useStore.getState().selectChapter('chB')
    expect(useStore.getState().chapter?.id).toBe('chB')

    await useStore.getState().deleteChapter('chB')
    expect(useStore.getState().book?.chapters.some((c) => c.id === 'chB')).toBe(false)
    expect(useStore.getState().chapter?.id).toBe('chA')
    expect(useStore.getState().content).toBe(contents.chA)
  })

  it('逐章删光:最后 chapter 为空且不报错', async () => {
    for (const id of ['chA', 'chB', 'chC', 'chD']) {
      await useStore.getState().deleteChapter(id)
    }
    const s = useStore.getState()
    expect(s.book?.chapters.length).toBe(0)
    expect(s.chapter).toBeNull()
    expect(s.content).toBe('')
  })
})
