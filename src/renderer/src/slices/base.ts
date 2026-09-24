import type { AppSettings, Book, BookSummary, Theme } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import type { StoreState } from '../store'
import { loadInspire, type SliceCtx, type WorkspaceMode } from './types'

const initialSettings: AppSettings = structuredClone(DEFAULT_SETTINGS)

/** 把章节元数据改动同步进当前 book 并持久化(章节/设定/AI/扫书各切片共用) */
export async function persistBook(ctx: SliceCtx, mutate?: (draft: Book) => void): Promise<void> {
  const { bookDir, book } = ctx.get()
  if (!bookDir || !book) return
  const draft = structuredClone(book)
  mutate?.(draft)
  const saved = await window.api.books.save(bookDir, draft)
  ctx.set({ book: saved })
}

/** 应用骨架切片:书库、当前书、设置、主题、视图切换、备份、导出 */
export interface BaseSlice {
  ready: boolean
  view: 'library' | 'workspace'
  books: BookSummary[]
  bookDir: string | null
  book: Book | null
  workspaceMode: WorkspaceMode
  settings: AppSettings
  settingsOpen: boolean
  createBookOpen: boolean
  /** Ctrl+K 命令面板浮层 */
  paletteOpen: boolean
  /** 沉浸写作模式:隐藏导航栏/侧栏/AI 面板,只留正文 */
  focusMode: boolean
  toast: { id: number; kind: 'info' | 'error'; message: string } | null

  init: () => Promise<void>
  applyTheme: (theme: Theme) => void
  showToast: (message: string, kind?: 'info' | 'error') => void
  refreshBooks: () => Promise<void>
  createBook: (info: { title: string; author: string; genre: string; description: string }) => Promise<void>
  removeBook: (dir: string) => Promise<void>
  /** 手动立即备份整本书(书库页按钮) */
  backupBook: (dir: string) => Promise<void>
  openBookAt: (dir: string) => Promise<void>
  backToLibrary: () => Promise<void>
  updateBook: (mutate: (draft: Book) => void) => Promise<void>
  setWorkspaceMode: (mode: WorkspaceMode) => void
  setSettingsOpen: (open: boolean) => void
  setCreateBookOpen: (open: boolean) => void
  setPaletteOpen: (open: boolean) => void
  setFocusMode: (on: boolean) => void
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  exportTxt: () => Promise<void>
}

export function baseSlice({ set, get }: SliceCtx): BaseSlice {
  return {
    ready: false,
    view: 'library',
    books: [],
    bookDir: null,
    book: null,
    workspaceMode: 'write',
    settings: initialSettings,
    settingsOpen: false,
    createBookOpen: false,
    paletteOpen: false,
    focusMode: false,
    toast: null,

    applyTheme: (theme) => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
    },

    showToast: (message, kind = 'info') => {
      const id = Date.now()
      set({ toast: { id, kind, message } })
      setTimeout(() => {
        if (get().toast?.id === id) set({ toast: null })
      }, 3500)
    },

    init: async () => {
      const settings = await window.api.settings.load()
      get().applyTheme(settings.theme)
      set({ settings })
      await get().refreshBooks()
      const { books } = get()
      const last = settings.lastBookPath ? books.find((b) => b.dir === settings.lastBookPath) : null
      if (last) await get().openBookAt(last.dir)
      else set({ view: 'library', ready: true })
    },

    refreshBooks: async () => {
      const books: BookSummary[] = await window.api.books.list()
      set({ books })
    },

    createBook: async (info) => {
      const { dir } = await window.api.books.create(info)
      await get().refreshBooks()
      await get().openBookAt(dir)
    },

    removeBook: async (dir) => {
      await window.api.books.remove(dir)
      await get().refreshBooks()
      get().showToast('已移入回收站')
    },

    backupBook: async (dir) => {
      try {
        const result = await window.api.books.backup(dir, true)
        if (result.skipped && result.reason === 'empty') {
          get().showToast('这本书还没有正文,无需备份', 'error')
        } else if (result.snapshotDir) {
          get().showToast(`已备份:${result.snapshotDir}`)
        }
      } catch (err) {
        get().showToast(`备份失败:${err instanceof Error ? err.message : String(err)}`, 'error')
      }
    },

    openBookAt: async (dir) => {
      if (get().chapter && get().dirty) await get().saveNow()
      const summary = get().books.find((b) => b.dir === dir)
      const found = summary ?? (await window.api.books.list()).find((b) => b.dir === dir)
      if (!found) return
      if (found.broken) {
        get().showToast('这本书的 book.json 已损坏,无法打开;删除后可从 .tmp 备份或回收站恢复', 'error')
        return
      }
      const loaded = found.book
      set({
        bookDir: dir,
        book: loaded,
        chapter: null,
        content: '',
        dirty: false,
        savedAt: null,
        view: 'workspace',
        aiOutput: '',
        aiError: null,
        aiRequest: null,
        aiRunning: false,
        selection: null,
        ready: true,
        focusMode: false,
        /* 换书:载入该书上次的灵感对话,同时确保不带着沉浸状态进来 */
        inspire: loadInspire(dir)
      })
      const settings = { ...get().settings, lastBookPath: dir }
      set({ settings })
      void window.api.settings.save(settings)
      /* 每日自动备份:静默进行,24 小时内已有快照则主进程自动跳过 */
      void window.api.books.backup(dir, false).catch(() => {})
      const firstChapter = loaded.chapters[0]
      if (firstChapter) await get().selectChapter(firstChapter.id)
    },

    backToLibrary: async () => {
      if (get().dirty) await get().saveNow()
      await get().refreshBooks()
      set({ view: 'library', book: null, bookDir: null, chapter: null, content: '', dirty: false, focusMode: false })
    },

    updateBook: async (mutate) => {
      await persistBook({ set, get }, mutate)
    },

    setWorkspaceMode: (mode) => set({ workspaceMode: mode, focusMode: false }),
    setSettingsOpen: (open) => set({ settingsOpen: open }),
    setCreateBookOpen: (open) => set({ createBookOpen: open }),
    setPaletteOpen: (open) => set({ paletteOpen: open }),
    setFocusMode: (on) => set({ focusMode: on }),

    updateSettings: async (patch) => {
      const settings = { ...get().settings, ...patch }
      set({ settings })
      get().applyTheme(settings.theme)
      await window.api.settings.save(settings)
    },

    exportTxt: async () => {
      const { bookDir } = get()
      if (!bookDir) return
      const savedPath = await window.api.books.exportTxt(bookDir)
      if (savedPath) get().showToast(`已导出到:${savedPath}`)
    }
  }
}
