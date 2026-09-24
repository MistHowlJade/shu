import type { Book, Chapter, ChapterStatus, Volume } from '@shared/types'
import type { StoreState } from '../store'
import { persistBook } from './base'
import { uid, type SliceCtx } from './types'

/** 章节切片:选章、正文编辑与保存、章节/卷结构、历史版本 */
export interface ChaptersSlice {
  chapter: Chapter | null
  content: string
  dirty: boolean
  savedAt: number | null
  selection: { start: number; end: number } | null
  /** 编辑器待恢复的光标位置(插入内容后使用) */
  pendingCaret: number | null
  /** 章节历史版本弹窗 */
  historyOpen: boolean

  selectChapter: (id: string) => Promise<void>
  setContent: (text: string) => void
  setSelection: (sel: { start: number; end: number } | null) => void
  saveNow: () => Promise<void>
  renameChapter: (title: string) => void
  setOutline: (text: string) => void
  createChapter: (volumeId: string) => Promise<void>
  deleteChapter: (id: string) => Promise<void>
  moveChapter: (id: string, offset: -1 | 1) => Promise<void>
  cycleChapterStatus: (id: string) => Promise<void>
  setHistoryOpen: (open: boolean) => void
  /** 把某份历史版本载入编辑器(不立即落盘,保存后才生效) */
  restoreHistory: (file: string) => Promise<void>

  addVolume: () => Promise<void>
  updateVolume: (id: string, patch: Partial<Volume>) => Promise<void>
  removeVolume: (id: string) => Promise<void>
}

export function chaptersSlice({ set, get }: SliceCtx): ChaptersSlice {
  const persist = (mutate?: (draft: Book) => void) => persistBook({ set, get }, mutate)

  return {
    chapter: null,
    content: '',
    dirty: false,
    savedAt: null,
    selection: null,
    pendingCaret: null,
    historyOpen: false,

    selectChapter: async (id) => {
      const { bookDir, chapter, dirty } = get()
      if (chapter?.id === id) return
      if (dirty) await get().saveNow()
      if (!bookDir) return
      const loaded = await window.api.chapters.read(bookDir, id)
      if (!loaded) return
      set({
        chapter: loaded,
        content: loaded.content,
        dirty: false,
        savedAt: null,
        selection: null,
        aiOutput: '',
        aiError: null
      })
    },

    setContent: (text) => {
      set({ content: text, dirty: true })
    },

    setSelection: (sel) => set({ selection: sel }),

    saveNow: async () => {
      const { bookDir, chapter, content } = get()
      if (!bookDir || !chapter) return
      const payload: Chapter = { ...chapter, content }
      const { chapter: saved, meta } = await window.api.chapters.save(bookDir, payload)
      set((state) => {
        if (!state.book) return {}
        const chapters = state.book.chapters.map((c) => (c.id === meta.id ? meta : c))
        return { chapter: { ...saved, content: state.content }, book: { ...state.book, chapters }, dirty: false, savedAt: Date.now() }
      })
    },

    renameChapter: (title) => {
      set((state) => (state.chapter ? { chapter: { ...state.chapter, title }, dirty: true } : {}))
    },

    setOutline: (text) => {
      /* 细纲是章节的一部分,标记 dirty 让 900ms 自动保存与退出 flush 都能带上它 */
      set((state) => (state.chapter ? { chapter: { ...state.chapter, outline: text }, dirty: true } : {}))
    },

    createChapter: async (volumeId) => {
      const { bookDir, book } = get()
      if (!bookDir || !book) return
      /* 章号用全书序号(与侧栏、细纲页、AI 上下文一致),不按卷重新计数 */
      const { chapter, meta } = await window.api.chapters.create(
        bookDir,
        volumeId,
        `第${book.chapters.length + 1}章 新章节`
      )
      set((state) => (state.book ? { book: { ...state.book, chapters: [...state.book.chapters, meta] } } : {}))
      await get().selectChapter(chapter.id)
    },

    deleteChapter: async (id) => {
      const { bookDir } = get()
      if (!bookDir) return
      await window.api.chapters.remove(bookDir, id)
      const wasCurrent = get().chapter?.id === id
      set((state) => {
        if (!state.book) return {}
        const chapters = state.book.chapters.filter((c) => c.id !== id)
        return {
          book: { ...state.book, chapters },
          chapter: wasCurrent ? null : state.chapter,
          content: wasCurrent ? '' : state.content,
          dirty: wasCurrent ? false : state.dirty
        }
      })
      if (wasCurrent) {
        const first = get().book?.chapters[0]
        if (first) await get().selectChapter(first.id)
      }
      get().showToast('章节已删除')
    },

    moveChapter: async (id, offset) => {
      await persist((draft) => {
        const idx = draft.chapters.findIndex((c) => c.id === id)
        if (idx === -1) return
        const target = idx + offset
        if (target < 0 || target >= draft.chapters.length) return
        if (draft.chapters[target].volumeId !== draft.chapters[idx].volumeId) return
        const [item] = draft.chapters.splice(idx, 1)
        draft.chapters.splice(target, 0, item)
      })
    },

    cycleChapterStatus: async (id) => {
      const order: ChapterStatus[] = ['todo', 'draft', 'done']
      await persist((draft) => {
        const meta = draft.chapters.find((c) => c.id === id)
        if (!meta) return
        meta.status = order[(order.indexOf(meta.status) + 1) % order.length]
      })
    },

    setHistoryOpen: (open) => set({ historyOpen: open }),

    restoreHistory: async (file) => {
      const { bookDir, chapter } = get()
      if (!bookDir || !chapter) return
      const snap = await window.api.chapters.readHistory(bookDir, chapter.id, file)
      if (!snap) {
        get().showToast('历史版本读取失败', 'error')
        return
      }
      /* 只载入编辑器并标脏:当前版本在保存前已被归档,不会丢 */
      set((state) => ({
        chapter: state.chapter ? { ...state.chapter, title: snap.title, outline: snap.outline, summary: snap.summary } : state.chapter,
        content: snap.content,
        dirty: true
      }))
      set({ historyOpen: false })
      get().showToast('已载入该历史版本,保存后生效')
    },

    addVolume: async () => {
      await persist((draft) => {
        draft.volumes.push({ id: uid(), title: `第${draft.volumes.length + 1}卷`, summary: '' })
      })
    },

    updateVolume: async (id, patch) => {
      await persist((draft) => {
        const v = draft.volumes.find((x) => x.id === id)
        if (v) Object.assign(v, patch)
      })
    },

    removeVolume: async (id) => {
      const { book } = get()
      if (book && book.chapters.some((c) => c.volumeId === id)) {
        get().showToast('该卷下还有章节,无法删除', 'error')
        return
      }
      await persist((draft) => {
        draft.volumes = draft.volumes.filter((v) => v.id !== id)
      })
    }
  }
}
