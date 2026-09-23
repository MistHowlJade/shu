import { create } from 'zustand'
import type {
  AiResult,
  ChatMessage,
  AppSettings,
  Book,
  BookSummary,
  Character,
  Chapter,
  ChapterStatus,
  GenerateKind,
  ItemEntry,
  Theme,
  Volume,
  Worldview
} from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
/* 宽松 JSON 解析与文本切段在主/渲染两侧共用,统一实现 */
export { chunkText, parseJsonLoose } from '@shared/text'
import { chunkText, parseJsonLoose } from '@shared/text'

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** 工作区三模式:写作 / 设定中心 / 大纲规划 */
export type WorkspaceMode = 'write' | 'codex' | 'outline' | 'import'

/* ---------------- 灵感对话(会话内状态) ---------------- */
export interface InspireMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
}
export interface InspireState {
  msgs: InspireMsg[]
  /** 正在流式接收 */
  busy: boolean
  /** 流式接收中的 assistant 文本(未定稿) */
  stream: string
  error: string | null
  requestId: string | null
}
function emptyInspire(): InspireState {
  return { msgs: [], busy: false, stream: '', error: null, requestId: null }
}
/* 灵感对话按书持久化到 localStorage:重启后接着聊(只留最近 100 条防止超限) */
const INSPIRE_MAX = 100
function inspireKey(dir: string): string {
  return `ai-novel:inspire:${dir}`
}
function loadInspire(dir: string): InspireState {
  try {
    const raw = localStorage.getItem(inspireKey(dir))
    if (!raw) return emptyInspire()
    const msgs = JSON.parse(raw) as InspireMsg[]
    return { ...emptyInspire(), msgs: Array.isArray(msgs) ? msgs.slice(-INSPIRE_MAX) : [] }
  } catch {
    return emptyInspire()
  }
}
function persistInspire(dir: string | null, msgs: InspireMsg[]): void {
  if (!dir) return
  try {
    const key = inspireKey(dir)
    if (msgs.length === 0) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(msgs.slice(-INSPIRE_MAX)))
  } catch {
    /* 存储满/被禁:放弃持久化,不影响本次会话 */
  }
}

export interface ScanItem {
  name: string
  category: string
  grade: string
  effect: string
  origin: string
  location: string
}

export interface ScanCharacter {
  name: string
  role: string
}

export interface ScanResults {
  worldviewText: string
  realms: string[]
  items: ScanItem[]
  characters: ScanCharacter[]
}

export interface ImporterState {
  fileName: string
  text: string
  status: 'idle' | 'analyzing'
  progressCurrent: number
  progressTotal: number
  log: string[]
  stop: boolean
  currentRequestId: string | null
  /** 只扫描前 N 万字,0 = 全部 */
  limitWan: number
  /** 世界观字段的写入方式 */
  worldMode: 'append' | 'replace'
  /**
   * 断点续扫:已成功扫完的段数(下次 startScan 从这里继续)。
   * 与 resumeSig(见 scanSignature)配合使用,文本/限制一变旧断点自动失效。
   */
  resumeIndex: number
  /** 上次扫描的进度签名;空串表示无可续扫的断点 */
  resumeSig: string
  /** 第一遍扫描失败的段号(多为临时限流),供「补扫失败段」定向重试 */
  failedChunks: number[]
  results: ScanResults
}

/**
 * 扫描断点签名:文本内容或"前 N 万字"限制变化后,旧的 resumeIndex
 * 指向的段号不再对应,签名不一致时 startScan 会从头开始。
 */
export function scanSignature(imp: ImporterState, full: string): string {
  return `${imp.fileName}|${imp.text.length}|${full.length}|${imp.limitWan}|${imp.text.slice(0, 40)}|${imp.text.slice(-40)}`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface AIRequest {
  id: string
  kind: GenerateKind
}

interface StoreState {
  ready: boolean
  view: 'library' | 'workspace'
  books: BookSummary[]
  bookDir: string | null
  book: Book | null
  chapter: Chapter | null
  content: string
  dirty: boolean
  savedAt: number | null
  workspaceMode: WorkspaceMode
  settings: AppSettings
  settingsOpen: boolean
  createBookOpen: boolean
  /** Ctrl+K 命令面板浮层 */
  paletteOpen: boolean
  /** 沉浸写作模式:隐藏导航栏/侧栏/AI 面板,只留正文 */
  focusMode: boolean
  /** 灵感对话:卡文时与 AI 边聊边构思(会话内状态,不落盘;换书时重置) */
  inspire: InspireState
  /* AI 状态 */
  aiRunning: boolean
  aiRequest: AIRequest | null
  aiOutput: string
  aiError: string | null
  aiIntent: string
  aiLastKind: GenerateKind | null
  selection: { start: number; end: number } | null
  /** 编辑器待恢复的光标位置(插入内容后使用) */
  pendingCaret: number | null
  /** 自动连写状态;null 表示未在连写 */
  autoWrite: { running: boolean; total: number; done: number; currentTitle: string; stop: boolean } | null
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
  /** 章节历史版本弹窗 */
  historyOpen: boolean
  setHistoryOpen: (open: boolean) => void
  /** 把某份历史版本载入编辑器(不立即落盘,保存后才生效) */
  restoreHistory: (file: string) => Promise<void>

  addVolume: () => Promise<void>
  updateVolume: (id: string, patch: Partial<Volume>) => Promise<void>
  removeVolume: (id: string) => Promise<void>

  addCharacter: () => Promise<void>
  addCharacterNamed: (name: string, role: string) => Promise<void>
  updateCharacter: (id: string, patch: Partial<Character>) => Promise<void>
  removeCharacter: (id: string) => Promise<void>
  updateWorldview: (patch: Partial<Worldview>) => void

  addItem: () => Promise<void>
  updateItem: (id: string, patch: Partial<ItemEntry>) => void
  removeItem: (id: string) => Promise<void>
  /** AI 起名:生成候选名列表 */
  generateNames: (hint: string) => Promise<void>
  /** AI 生成物品卡(直接建卡) */
  generateItem: (category: string, hint: string) => Promise<void>
  /** 从当前章节提取阶段性物品 */
  extractItemsFromChapter: () => Promise<void>
  namingBusy: boolean
  nameCandidates: string[]
  itemBusy: boolean
  extractBusy: boolean
  importer: ImporterState

  importTxtFile: () => Promise<void>
  importFromUrl: (url: string) => Promise<void>
  setImportText: (text: string) => void
  setScanLimit: (wan: number) => void
  setWorldMode: (mode: 'append' | 'replace') => void
  startScan: (opts?: { fromScratch?: boolean }) => Promise<void>
  stopScan: () => Promise<void>
  removeScanRealm: (index: number) => void
  removeScanItem: (index: number) => void
  removeScanCharacter: (index: number) => void
  updateScanWorldview: (text: string) => void
  applyScanToBook: () => Promise<void>
  /** 自动设定检测:扫本章并静默入库(受 settings.autoScan 控制) */
  autoDetectChapter: () => Promise<void>

  setAiIntent: (text: string) => void
  setWorkspaceMode: (mode: WorkspaceMode) => void
  setSettingsOpen: (open: boolean) => void
  setCreateBookOpen: (open: boolean) => void
  setPaletteOpen: (open: boolean) => void
  setFocusMode: (on: boolean) => void
  sendInspire: (text: string) => Promise<void>
  stopInspire: () => Promise<void>
  clearInspire: () => void
  insertInspire: (text: string) => void
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  runGenerate: (kind: GenerateKind) => Promise<void>
  stopGenerate: () => Promise<void>
  appendOutputToContent: () => Promise<void>
  insertOutputAtCursor: () => Promise<void>
  replaceChapterWithOutput: () => Promise<void>
  replaceSelectionWithOutput: () => Promise<void>
  applyOutputToOutline: (mode: 'set' | 'append') => Promise<void>
  copyOutput: () => Promise<void>
  clearAiOutput: () => void
  exportTxt: () => Promise<void>
  runAutoWrite: (count: number) => Promise<void>
  stopAutoWrite: () => Promise<void>
}

const initialSettings: AppSettings = structuredClone(DEFAULT_SETTINGS)

export const useStore = create<StoreState>()((set, get) => {
  /** 把章节元数据改动同步进当前 book 并持久化 */
  async function persistBook(mutate?: (draft: Book) => void): Promise<void> {
    const { bookDir, book } = get()
    if (!bookDir || !book) return
    const draft = structuredClone(book)
    mutate?.(draft)
    const saved = await window.api.books.save(bookDir, draft)
    set({ book: saved })
  }

  return {
    ready: false,
    view: 'library',
    books: [],
    bookDir: null,
    book: null,
    chapter: null,
    content: '',
    dirty: false,
    savedAt: null,
    workspaceMode: 'write',
    settings: initialSettings,
    settingsOpen: false,
    createBookOpen: false,
    paletteOpen: false,
    focusMode: false,
    inspire: emptyInspire(),
    aiRunning: false,
    aiRequest: null,
    aiOutput: '',
    aiError: null,
    aiIntent: '',
    aiLastKind: null,
    selection: null,
    pendingCaret: null,
    autoWrite: null,
    namingBusy: false,
    nameCandidates: [],
    itemBusy: false,
    extractBusy: false,
    importer: {
      fileName: '',
      text: '',
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
      results: { worldviewText: '', realms: [], items: [], characters: [] }
    },
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
      const books = await window.api.books.list()
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
      await persistBook(mutate)
    },

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
      await persistBook((draft) => {
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
      await persistBook((draft) => {
        const meta = draft.chapters.find((c) => c.id === id)
        if (!meta) return
        meta.status = order[(order.indexOf(meta.status) + 1) % order.length]
      })
    },

    historyOpen: false,
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
      await persistBook((draft) => {
        draft.volumes.push({ id: uid(), title: `第${draft.volumes.length + 1}卷`, summary: '' })
      })
    },

    updateVolume: async (id, patch) => {
      await persistBook((draft) => {
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
      await persistBook((draft) => {
        draft.volumes = draft.volumes.filter((v) => v.id !== id)
      })
    },

    addCharacter: async () => {
      await persistBook((draft) => {
        draft.characters.push({
          id: uid(),
          name: '新人物',
          role: '',
          personality: '',
          background: '',
          arc: '',
          notes: ''
        })
      })
    },

    addCharacterNamed: async (name, role) => {
      await persistBook((draft) => {
        draft.characters.push({
          id: uid(),
          name,
          role: role || '',
          personality: '',
          background: '',
          arc: '',
          notes: ''
        })
      })
      get().showToast(`已创建人物卡:${name}`)
    },

    updateCharacter: async (id, patch) => {
      // 局部即时更新(避免每次击键都写盘),失焦时统一持久化
      set((state) => {
        if (!state.book) return {}
        return {
          book: {
            ...state.book,
            characters: state.book.characters.map((c) => (c.id === id ? { ...c, ...patch } : c))
          }
        }
      })
    },

    removeCharacter: async (id) => {
      await persistBook((draft) => {
        draft.characters = draft.characters.filter((c) => c.id !== id)
      })
    },

    updateWorldview: (patch) => {
      set((state) => (state.book ? { book: { ...state.book, worldview: { ...state.book.worldview, ...patch } } } : {}))
    },

    addItem: async () => {
      await persistBook((draft) => {
        draft.items.push({
          id: uid(),
          name: '新物品',
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
      })
    },

    updateItem: (id, patch) => {
      set((state) => {
        if (!state.book) return {}
        return {
          book: {
            ...state.book,
            items: state.book.items.map((it) => (it.id === id ? { ...it, ...patch } : it))
          }
        }
      })
    },

    removeItem: async (id) => {
      await persistBook((draft) => {
        draft.items = draft.items.filter((it) => it.id !== id)
      })
    },

    generateNames: async (hint) => {
      const { namingBusy, bookDir, book } = get()
      if (namingBusy || !bookDir || !book) return
      set({ namingBusy: true, nameCandidates: [] })
      try {
        const result = await window.api.ai.generateNames({ requestId: uid(), dir: bookDir, hint })
        if (result.ok && result.text) {
          const names = result.text
            .split(/[\n\r]+/)
            .map((s) => s.trim().replace(/^[-·•\d]+[.、)）]?\s*/, ''))
            .filter((s) => s && s.length <= 12)
            .slice(0, 8)
          set({ nameCandidates: names })
        } else {
          get().showToast(`起名失败:${result.error ?? '未知错误'}`, 'error')
        }
      } finally {
        set({ namingBusy: false })
      }
    },

    generateItem: async (category, hint) => {
      const { itemBusy, bookDir, book } = get()
      if (itemBusy || !bookDir || !book) return
      set({ itemBusy: true })
      try {
        const result = await window.api.ai.generateItem({ requestId: uid(), dir: bookDir, category, hint })
        if (!result.ok || !result.text) {
          get().showToast(`生成物品失败:${result.error ?? '未知错误'}`, 'error')
          return
        }
        const parsed = parseJsonLoose<Partial<ItemEntry>>(result.text)
        if (!parsed || !parsed.name?.trim()) {
          get().showToast('AI 返回的格式无法解析,请重试一次', 'error')
          return
        }
        await persistBook((draft) => {
          draft.items.push({
            id: uid(),
            name: parsed.name!.trim(),
            category: category.trim() || parsed.category?.trim() || '其他',
            grade: parsed.grade?.trim() ?? '',
            appearance: parsed.appearance?.trim() ?? '',
            effect: parsed.effect?.trim() ?? '',
            origin: parsed.origin?.trim() ?? '',
            location: parsed.location?.trim() ?? '',
            owner: parsed.owner?.trim() ?? '',
            stage: '',
            notes: parsed.notes?.trim() ?? ''
          })
        })
        get().showToast(`已生成物品卡:${parsed.name.trim()}`)
      } finally {
        set({ itemBusy: false })
      }
    },

    extractItemsFromChapter: async () => {
      const { extractBusy, bookDir, book, chapter } = get()
      if (extractBusy || !bookDir || !book || !chapter) return
      set({ extractBusy: true })
      try {
        const result = await window.api.ai.extractItems({ requestId: uid(), dir: bookDir, chapterId: chapter.id, intent: '' })
        if (!result.ok || !result.text) {
          get().showToast(`提取失败:${result.error ?? '未知错误'}`, 'error')
          return
        }
        const parsed = parseJsonLoose<Array<Partial<ItemEntry>>>(result.text)
        if (!parsed || !Array.isArray(parsed)) {
          get().showToast('AI 返回的格式无法解析,请重试一次', 'error')
          return
        }
        const chapterIndex = book.chapters.findIndex((m) => m.id === chapter.id) + 1
        const stageLabel = chapterIndex > 0 ? `第${chapterIndex}章《${chapter.title}》` : chapter.title
        const existingNames = new Set(book.items.map((it) => it.name.trim()))
        const fresh = parsed.filter(
          (it) => it.name?.trim() && !existingNames.has(it.name.trim())
        )
        if (fresh.length === 0) {
          get().showToast('本章没有提取到新物品')
          return
        }
        await persistBook((draft) => {
          for (const it of fresh) {
            draft.items.push({
              id: uid(),
              name: it.name!.trim(),
              category: it.category?.trim() || '其他',
              grade: it.grade?.trim() ?? '',
              appearance: it.appearance?.trim() ?? '',
              effect: it.effect?.trim() ?? '',
              origin: it.origin?.trim() ?? '',
              location: it.location?.trim() ?? '',
              owner: it.owner?.trim() ?? '',
              stage: it.stage?.trim() || stageLabel,
              notes: ''
            })
          }
        })
        get().showToast(`本章提取到 ${fresh.length} 件物品,已建卡`)
      } finally {
        set({ extractBusy: false })
      }
    },

    setAiIntent: (text) => set({ aiIntent: text }),
    setWorkspaceMode: (mode) => set({ workspaceMode: mode, focusMode: false }),

    importTxtFile: async () => {
      const loaded = await window.api.importer.openTxt()
      if (!loaded) return
      set((s) => ({
        importer: {
          ...s.importer,
          fileName: loaded.name,
          text: loaded.text,
          log: [`已载入《${loaded.name}》:${loaded.text.length.toLocaleString('zh-CN')} 字`]
        }
      }))
    },

    importFromUrl: async (url) => {
      const { importer } = get()
      if (importer.status === 'analyzing') return
      if (!url.trim()) {
        get().showToast('请填写网页链接', 'error')
        return
      }
      set((s) => ({ importer: { ...s.importer, log: [...s.importer.log, `正在抓取网页:${url}`] } }))
      const result = await window.api.importer.fetchUrl(url)
      if (result.ok && result.text) {
        set((s) => ({
          importer: {
            ...s.importer,
            fileName: url,
            text: result.text ?? '',
            log: [...s.importer.log, `抓取成功:${(result.text ?? '').length.toLocaleString('zh-CN')} 字`]
          }
        }))
      } else {
        set((s) => ({ importer: { ...s.importer, log: [...s.importer.log, `抓取失败:${result.error ?? '未知'}`] } }))
        get().showToast(`抓取失败:${result.error ?? '未知错误'}`, 'error')
      }
    },

    setImportText: (text) =>
      set((s) => ({ importer: { ...s.importer, text, fileName: text.trim() ? '粘贴的文本' : '' } })),
    setScanLimit: (wan) => set((s) => ({ importer: { ...s.importer, limitWan: Math.max(0, wan) } })),
    setWorldMode: (mode) => set((s) => ({ importer: { ...s.importer, worldMode: mode } })),

    startScan: async (opts) => {
      const imp = get().importer
      if (imp.status === 'analyzing') return
      if (!imp.text.trim()) {
        get().showToast('请先导入 TXT / 抓取网页 / 粘贴文本', 'error')
        return
      }
      const full = imp.limitWan > 0 ? imp.text.slice(0, imp.limitWan * 10000) : imp.text
      const chunks = chunkText(full)
      if (chunks.length === 0) return
      /* 三种入口:断点续扫(中途停止)/ 补扫失败段(已全过一遍但有段落失败)/ 从头扫描 */
      const sig = scanSignature(imp, full)
      const sigOk = !opts?.fromScratch && imp.resumeSig === sig
      const carriedFailed = sigOk
        ? [...new Set(imp.failedChunks)].filter((i) => i >= 0 && i < chunks.length)
        : []
      const canResume = sigOk && imp.resumeIndex > 0 && imp.resumeIndex < chunks.length
      const retryOnly = sigOk && !canResume && carriedFailed.length > 0 && imp.resumeIndex >= chunks.length
      const fresh = Boolean(opts?.fromScratch) || (!canResume && !retryOnly)

      let todo: number[]
      let startResumeIndex: number
      let modeLog: string
      if (retryOnly) {
        todo = carriedFailed
        startResumeIndex = imp.resumeIndex
        modeLog = `补扫失败段:共 ${carriedFailed.length} 段(其余段已扫过)`
      } else if (canResume) {
        todo = Array.from({ length: chunks.length - imp.resumeIndex }, (_, k) => imp.resumeIndex + k)
        startResumeIndex = imp.resumeIndex
        modeLog = `断点续扫:从第 ${startResumeIndex + 1} 段继续,共 ${chunks.length} 段`
      } else {
        todo = Array.from({ length: chunks.length }, (_, k) => k)
        startResumeIndex = 0
        modeLog = `开始扫描:共 ${chunks.length} 段(每段约 4500 字)`
      }
      const failedNow = new Set<number>(fresh ? [] : carriedFailed)

      set({
        importer: {
          ...imp,
          status: 'analyzing',
          stop: false,
          progressCurrent: 0,
          progressTotal: todo.length,
          resumeIndex: startResumeIndex,
          resumeSig: sig,
          failedChunks: fresh ? [] : carriedFailed,
          log: [modeLog]
        }
      })
      const log = (line: string) =>
        set((s) => ({ importer: { ...s.importer, log: [...s.importer.log.slice(-200), line] } }))

      /* 合并单段 AI 结果到累计集(去重),格式异常只跳过该段不报错 */
      const mergeResult = (i: number, text: string): void => {
        const parsed = parseJsonLoose<{
          worldview?: string
          realms?: string[]
          items?: Partial<ScanItem>[]
          characters?: Partial<ScanCharacter>[]
        }>(text)
        if (!parsed) {
          log(`第 ${i + 1} 段返回格式异常,已跳过`)
          return
        }
        set((s) => {
          const r: ScanResults = {
            worldviewText: s.importer.results.worldviewText,
            realms: [...s.importer.results.realms],
            items: [...s.importer.results.items],
            characters: [...s.importer.results.characters]
          }
          let facts = 0
          let realms = 0
          let items = 0
          let chars = 0
          const wv = parsed.worldview?.trim()
          if (wv && !r.worldviewText.includes(wv.slice(0, 30))) {
            r.worldviewText += (r.worldviewText ? '\n' : '') + '· ' + wv
            facts = 1
          }
          for (const realm of parsed.realms ?? []) {
            const t = realm.trim()
            if (t && !r.realms.some((x) => x.toLowerCase() === t.toLowerCase())) {
              r.realms.push(t)
              realms++
            }
          }
          for (const it of parsed.items ?? []) {
            const name = it.name?.trim()
            if (name && !r.items.some((x) => x.name === name)) {
              r.items.push({
                name,
                category: it.category?.trim() || '其他',
                grade: it.grade?.trim() ?? '',
                effect: it.effect?.trim() ?? '',
                origin: it.origin?.trim() ?? '',
                location: it.location?.trim() ?? ''
              })
              items++
            }
          }
          for (const c of parsed.characters ?? []) {
            const name = c.name?.trim()
            if (name && !r.characters.some((x) => x.name === name)) {
              r.characters.push({ name, role: c.role?.trim() ?? '' })
              chars++
            }
          }
          return {
            importer: {
              ...s.importer,
              results: r,
              log: [
                ...s.importer.log.slice(-200),
                `第 ${i + 1} 段完成:+${realms}境界 +${items}物品 +${chars}人物${facts ? ' +世界观要点' : ''}`
              ]
            }
          }
        })
      }

      /* 单段处理:指数退避多轮重试(3/6/12 秒),整本扫描时抗临时限流;仍失败由调用方记入失败段而不是终止 */
      const MAX_TRY = 4
      const processChunk = async (i: number): Promise<'ok' | 'failed' | 'stopped'> => {
        const requestId = uid()
        set((s) => ({ importer: { ...s.importer, currentRequestId: requestId } }))
        let result: AiResult | null = null
        for (let attempt = 1; attempt <= MAX_TRY; attempt++) {
          if (get().importer.stop) return 'stopped'
          result = await window.api.ai.scanChunk({ requestId, chunk: chunks[i] })
          if (result.ok) break
          if (attempt < MAX_TRY) {
            const wait = 3000 * 2 ** (attempt - 1)
            log(`第 ${i + 1} 段失败(${result.error ?? '未知'}),${wait / 1000} 秒后重试(${attempt}/${MAX_TRY - 1})…`)
            await delay(wait)
          }
        }
        if (get().importer.stop) return 'stopped'
        if (!result?.ok) return 'failed'
        mergeResult(i, result.text ?? '')
        return 'ok'
      }

      let doneCount = 0
      let aborted = false
      const runOne = async (i: number): Promise<void> => {
        set((s) => ({ importer: { ...s.importer, progressCurrent: doneCount + 1 } }))
        const status = await processChunk(i)
        if (status === 'stopped') {
          aborted = true
          return
        }
        if (status === 'ok') failedNow.delete(i)
        else {
          failedNow.add(i)
          log(`第 ${i + 1} 段重试 ${MAX_TRY} 次仍失败(可能被限流),已跳过,稍后自动补扫`)
        }
        doneCount++
        /* 无论成败都推进断点并落盘失败清单:中途停止也不会重扫已处理的段 */
        set((s) => ({
          importer: {
            ...s.importer,
            progressCurrent: doneCount,
            resumeIndex: Math.max(s.importer.resumeIndex, i + 1),
            failedChunks: [...failedNow]
          }
        }))
      }

      for (const i of todo) {
        if (get().importer.stop) {
          aborted = true
          break
        }
        await runOne(i)
        if (aborted) break
      }

      /* 第一遍结束后自动补扫失败段:免费模型的 429/503 多为临时,再给一轮机会 */
      if (!aborted && !get().importer.stop && failedNow.size > 0) {
        const retryList = [...failedNow]
        log(`第一遍完成,自动补扫 ${retryList.length} 个失败段…`)
        set((s) => ({ importer: { ...s.importer, progressTotal: doneCount + retryList.length } }))
        for (const i of retryList) {
          if (get().importer.stop) {
            aborted = true
            break
          }
          await runOne(i)
          if (aborted) break
        }
      }

      const stopped = get().importer.stop
      const remaining = [...failedNow].sort((a, b) => a - b)
      const finished = !aborted && !stopped && remaining.length === 0
      set((s) => ({
        importer: {
          ...s.importer,
          status: 'idle',
          currentRequestId: null,
          failedChunks: remaining,
          /* 全部段落扫完且无失败才清断点;否则保留 resumeIndex/resumeSig/failedChunks 供续扫与补扫 */
          ...(finished ? { resumeIndex: 0, resumeSig: '', failedChunks: [] } : {})
        }
      }))
      const r = get().importer.results
      const stats = `${r.realms.length} 境界 / ${r.items.length} 物品 / ${r.characters.length} 人物`
      if (stopped) {
        get().showToast(`扫描已停止:已收集 ${stats},点「继续扫描」可断点续扫`)
      } else if (remaining.length > 0) {
        get().showToast(`整本已扫完一遍,但 ${remaining.length} 段失败(多为限流),点「补扫失败段」重试`, 'error')
      } else {
        get().showToast(
          `扫描完成:${r.realms.length} 个境界、${r.items.length} 件物品、${r.characters.length} 位人物`
        )
      }
    },

    stopScan: async () => {
      const imp = get().importer
      if (imp.status !== 'analyzing') return
      set({ importer: { ...imp, stop: true } })
      if (imp.currentRequestId) await window.api.ai.abort(imp.currentRequestId)
    },

    removeScanRealm: (index) =>
      set((s) => {
        const realms = [...s.importer.results.realms]
        realms.splice(index, 1)
        return { importer: { ...s.importer, results: { ...s.importer.results, realms } } }
      }),

    removeScanItem: (index) =>
      set((s) => {
        const items = [...s.importer.results.items]
        items.splice(index, 1)
        return { importer: { ...s.importer, results: { ...s.importer.results, items } } }
      }),

    removeScanCharacter: (index) =>
      set((s) => {
        const characters = [...s.importer.results.characters]
        characters.splice(index, 1)
        return { importer: { ...s.importer, results: { ...s.importer.results, characters } } }
      }),

    updateScanWorldview: (text) =>
      set((s) => ({ importer: { ...s.importer, results: { ...s.importer.results, worldviewText: text } } })),

    applyScanToBook: async () => {
      const { importer, book } = get()
      if (!book) return
      const r = importer.results
      const newItemCount = r.items.filter((it) => !book.items.some((x) => x.name.trim() === it.name)).length
      const newCharCount = r.characters.filter((c) => !book.characters.some((x) => x.name.trim() === c.name)).length
      if (!r.worldviewText.trim() && r.realms.length === 0 && newItemCount === 0 && newCharCount === 0) {
        get().showToast('没有可写入的新内容(可能与现有设定重复)', 'error')
        return
      }
      await persistBook((draft) => {
        const replace = importer.worldMode === 'replace'
        if (r.realms.length > 0) {
          const realmText = r.realms.join(' → ')
          draft.worldview.powerSystem =
            replace || !draft.worldview.powerSystem.trim()
              ? realmText
              : draft.worldview.powerSystem.trim() + '\n' + realmText
        }
        if (r.worldviewText.trim()) {
          draft.worldview.setting =
            replace || !draft.worldview.setting.trim()
              ? r.worldviewText.trim()
              : draft.worldview.setting.trim() + '\n' + r.worldviewText.trim()
        }
        const itemNames = new Set(draft.items.map((x) => x.name.trim()))
        for (const it of r.items) {
          if (itemNames.has(it.name)) continue
          draft.items.push({
            id: uid(),
            name: it.name,
            category: it.category,
            grade: it.grade,
            appearance: '',
            effect: it.effect,
            origin: it.origin,
            location: it.location,
            owner: '',
            stage: '扫书导入',
            notes: ''
          })
        }
        const charNames = new Set(draft.characters.map((x) => x.name.trim()))
        for (const c of r.characters) {
          if (charNames.has(c.name)) continue
          draft.characters.push({
            id: uid(),
            name: c.name,
            role: c.role || '扫书导入',
            personality: '',
            background: '',
            arc: '',
            notes: ''
          })
        }
      })
      get().showToast(`已写入当前书:新增 ${newItemCount} 件物品卡、${newCharCount} 张人物卡,世界观/境界已更新`)
    },

    /* ---------------- 新设定自动入库 ---------------- */

    autoDetectChapter: async () => {
      const { settings, bookDir, chapter } = get()
      if (!settings.autoScan || !bookDir || !chapter) return
      try {
        /* 主进程按磁盘正文扫描,未保存的内容先落盘 */
        if (get().dirty) await get().saveNow()
        const result = await window.api.ai.scanChapter({ dir: bookDir, chapterId: chapter.id })
        if (!result.ok) {
          if (result.error) get().showToast(`新设定检测失败:${result.error}`, 'error')
          return
        }
        const { newCharacters, newItems, newRealms, worldAdded } = result
        const parts = [
          newCharacters > 0 && `人物 ${newCharacters}`,
          newItems > 0 && `物品 ${newItems}`,
          newRealms > 0 && `境界 ${newRealms}`,
          worldAdded && '世界观'
        ].filter(Boolean)
        if (parts.length === 0) return
        /* 主进程只返回增量(不再写 book.json):合并进当前内存副本后由 persistBook 统一落盘,
           避免整体覆盖内存里未保存的编辑,也避免扫描期间切书造成的跨书污染 */
        const incChar = result.addedCharacters ?? []
        const incItem = result.addedItems ?? []
        const incRealm = result.addedRealms ?? []
        const incWorld = result.addedWorldLines ?? []
        await persistBook((draft) => {
          const charNames = new Set(draft.characters.map((c) => c.name.trim()))
          for (const c of incChar) {
            if (charNames.has(c.name.trim())) continue
            charNames.add(c.name.trim())
            draft.characters.push(c)
          }
          const itemNames = new Set(draft.items.map((it) => it.name.trim()))
          for (const it of incItem) {
            if (itemNames.has(it.name.trim())) continue
            itemNames.add(it.name.trim())
            draft.items.push(it)
          }
          for (const realm of incRealm) {
            if (draft.worldview.powerSystem.includes(realm)) continue
            draft.worldview.powerSystem = draft.worldview.powerSystem.trim()
              ? draft.worldview.powerSystem.trim() + ' → ' + realm
              : realm
          }
          for (const line of incWorld) {
            if (draft.worldview.setting.includes(line.slice(0, 30))) continue
            draft.worldview.setting = draft.worldview.setting.trim()
              ? draft.worldview.setting.trim() + '\n· ' + line
              : '· ' + line
          }
        })
        get().showToast(`检测到新设定,已自动入库:${parts.join('、')}`)
      } catch (err) {
        get().showToast(`新设定检测失败:${err instanceof Error ? err.message : String(err)}`, 'error')
      }
    },

    setSettingsOpen: (open) => set({ settingsOpen: open }),
    setCreateBookOpen: (open) => set({ createBookOpen: open }),
    setPaletteOpen: (open) => set({ paletteOpen: open }),
    setFocusMode: (on) => set({ focusMode: on }),
    clearInspire: () => {
      persistInspire(get().bookDir, [])
      set({ inspire: emptyInspire() })
    },

    insertInspire: (text) => {
      const { content, selection } = get()
      if (!text) return
      const at = selection ? Math.min(Math.max(0, selection.start), content.length) : content.length
      const next = content.slice(0, at) + text + content.slice(at)
      set({ content: next, dirty: true, pendingCaret: at + text.length })
    },

    stopInspire: async () => {
      const req = get().inspire.requestId
      if (req) {
        await window.api.ai.abort(req)
        /* abort 后 sendInspire 的收尾逻辑负责落对话/恢复 busy */
      }
    },

    sendInspire: async (text) => {
      const trimmed = text.trim()
      const { inspire, book, chapter, aiRunning, bookDir: dir } = get()
      if (!trimmed || inspire.busy || aiRunning) return

      const userMsg: InspireMsg = { id: uid(), role: 'user', content: trimmed }
      const history = [...inspire.msgs, userMsg]
      const requestId = uid()
      set({
        inspire: { msgs: history, busy: true, stream: '', error: null, requestId }
      })
      /* 问题先落盘,生成途中关窗口也不丢 */
      persistInspire(dir, history)

      /* 流式增量:acc 是已收文本的真相来源;期间若切了书,只记录不污染新书对话 */
      let acc = ''
      const unsubscribe = window.api.ai.onDelta((payload) => {
        if (payload.requestId !== requestId) return
        acc += payload.delta
        if (get().bookDir !== dir) return
        const cur = useStore.getState().inspire
        set({ inspire: { ...cur, stream: acc } })
      })

      /* 系统提示:写作灵感伙伴 + 当前书/章上下文,让建议贴着剧情走 */
      const ctxParts: string[] = []
      if (book) ctxParts.push(`当前小说《${book.title}》(${book.genre})`)
      if (chapter) {
        ctxParts.push(`正在写第${(book?.chapters.findIndex((c) => c.id === chapter.id) ?? 0) + 1}章「${chapter.title}」`)
        if (chapter.outline?.trim()) ctxParts.push(`本章细纲:${chapter.outline.trim().slice(0, 400)}`)
      }
      const system: ChatMessage = {
        role: 'system',
        content:
          '你是网文作者的「灵感陪聊」搭档。作者写作卡住时会一边和你聊一边自己思考,目标是帮他把下一段怎么写想清楚。\n' +
          '规则:\n' +
          '1. 中文口语化回复,像懂行的责编朋友聊天,不要摆架子、不要客套。\n' +
          '2. 一次给 2~3 个具体可写的方向(冲突、爽点、反转、情绪、对话……),每个方向用一两句示范怎么落到纸上。\n' +
          '3. 适当用反问抛问题,引导作者自己做选择;作者已给出的想法要顺着深入,不要推翻。\n' +
          '4. 除非作者要求展开,正文控制在 250 字以内。\n' +
          '5. 与作者已确定的设定、细纲保持一致,不要自相矛盾。\n' +
          (ctxParts.length ? `背景:${ctxParts.join(';')}。` : '')
      }
      const messages: ChatMessage[] = [
        system,
        ...history.map((m) => ({ role: m.role, content: m.content }))
      ]

      let result: AiResult
      try {
        result = await window.api.ai.generate(requestId, messages)
      } catch (e) {
        unsubscribe()
        if (get().bookDir === dir) {
          set({
            inspire: { ...get().inspire, busy: false, stream: '', requestId: null, error: String(e) }
          })
        }
        return
      }
      unsubscribe()

      /* 定稿:成功或手动停止都保留(部分)回复;手动停止是正常操作,不算错误 */
      const stopped = !result.ok && result.error === '已停止生成'
      const finalText = (result.ok ? result.text : '') || acc
      const nextMsgs: InspireMsg[] = finalText
        ? [...history, { id: uid(), role: 'assistant', content: finalText }]
        : history
      persistInspire(dir, nextMsgs)
      if (get().bookDir !== dir) return /* 用户已切走:不动新书的界面状态 */
      set({
        inspire: {
          msgs: nextMsgs,
          busy: false,
          stream: '',
          requestId: null,
          error: result.ok || stopped ? null : result.error || '生成失败'
        }
      })
    },

    updateSettings: async (patch) => {
      const settings = { ...get().settings, ...patch }
      set({ settings })
      get().applyTheme(settings.theme)
      await window.api.settings.save(settings)
    },

    runGenerate: async (kind) => {
      const { aiRunning, bookDir, chapter, content, selection, aiIntent: intent } = get()
      if (aiRunning || !bookDir || !chapter) return
      /* 主进程按磁盘正文组装上下文(摘要/续写/扫描都读盘),先把未保存的编辑落盘 */
      if (get().dirty) await get().saveNow()
      const requestId = uid()
      set({ aiRunning: true, aiRequest: { id: requestId, kind }, aiOutput: '', aiError: null, aiLastKind: kind })

      /* 订阅流式增量 */
      const unsubscribe = window.api.ai.onDelta((payload) => {
        if (payload.requestId !== requestId) return
        useStore.setState({ aiOutput: useStore.getState().aiOutput + payload.delta })
      })

      const input = { requestId, dir: bookDir, chapterId: chapter.id, intent }
      let result: AiResult
      try {
        if (kind === 'chapter') result = await window.api.ai.generateChapter(input)
        else if (kind === 'continue') {
          /* 从光标位置续写;未定位到光标(或光标在开头)则从章末 */
          const cursor = selection ? Math.min(Math.max(0, selection.start), content.length) : content.length
          const raw = content.slice(0, cursor)
          const textBefore = raw.trim() ? raw : content
          if (!textBefore.trim()) {
            unsubscribe()
            set({ aiRunning: false, aiRequest: null, aiError: '本章还没有内容,请先写一段或用「生成整章」' })
            return
          }
          result = await window.api.ai.generateContinue({ requestId, dir: bookDir, chapterId: chapter.id, textBefore })
        }
        else if (kind === 'outline') result = await window.api.ai.generateOutline(input)
        else if (kind === 'summary') result = await window.api.ai.summarize(input)
        else {
          const text = selection ? content.slice(selection.start, selection.end) : ''
          if (!text.trim()) {
            unsubscribe()
            set({ aiRunning: false, aiRequest: null, aiError: '请先在正文中选中要润色的文字' })
            return
          }
          result = await window.api.ai.polish({ requestId, dir: bookDir, chapterId: chapter.id, selection: text })
        }
      } catch (err) {
        unsubscribe()
        set({ aiRunning: false, aiRequest: null, aiError: err instanceof Error ? err.message : String(err) })
        return
      }
      unsubscribe()

      if (result.ok && kind === 'summary' && result.text) {
        const summary = result.text.trim()
        set((state) => ({
          chapter: state.chapter ? { ...state.chapter, summary } : state.chapter,
          aiOutput: summary
        }))
      }
      set({
        /* 失败或中断时保留已流式输出的部分内容 */
        aiOutput: result.ok && kind !== 'summary' ? (result.text ?? '') : get().aiOutput,
        /* 手动停止是正常操作,不弹红色错误 */
        aiError: result.ok || result.error === '已停止生成' ? null : (result.error ?? '生成失败')
      })
      if (kind === 'summary' && result.ok) {
        get().showToast('前情摘要已写入本章')
        /* 摘要即「本章写完」的信号,顺带检出本章新设定;期间保持忙碌态,避免用户再触发一次 AI 请求 */
        await get().autoDetectChapter()
      }
      if (!result.ok && result.error !== '已停止生成') get().showToast(`生成失败:${result.error}`, 'error')
      set({
        aiRunning: false,
        aiRequest: get().aiRequest?.id === requestId ? null : get().aiRequest
      })
    },

    stopGenerate: async () => {
      const { aiRequest } = get()
      if (aiRequest) await window.api.ai.abort(aiRequest.id)
    },

    appendOutputToContent: async () => {
      const { aiOutput, content } = get()
      if (!aiOutput.trim()) return
      const joiner = content.trim() ? '\n\n' : ''
      get().setContent(content.replace(/\s*$/, '') + joiner + aiOutput.trim())
      get().showToast('已追加到正文末尾')
    },

    insertOutputAtCursor: async () => {
      const { aiOutput, content, selection } = get()
      if (!aiOutput.trim()) return
      const cursor = selection ? Math.min(Math.max(0, selection.start), content.length) : content.length
      const insert = aiOutput.trim()
      get().setContent(content.slice(0, cursor) + insert + content.slice(cursor))
      set({ pendingCaret: cursor + insert.length, selection: { start: cursor + insert.length, end: cursor + insert.length } })
      get().showToast('已插入到光标处')
    },

    replaceChapterWithOutput: async () => {
      const { aiOutput } = get()
      if (!aiOutput.trim()) return
      get().setContent(aiOutput.trim())
      get().showToast('已替换本章正文')
    },

    replaceSelectionWithOutput: async () => {
      const { aiOutput, content, selection } = get()
      if (!aiOutput.trim() || !selection) return
      const next = content.slice(0, selection.start) + aiOutput.trim() + content.slice(selection.end)
      get().setContent(next)
      set({ selection: null })
      get().showToast('已替换选中内容')
    },

    applyOutputToOutline: async (mode) => {
      const { aiOutput, chapter } = get()
      if (!aiOutput.trim() || !chapter) return
      const next = mode === 'set' ? aiOutput.trim() : (chapter.outline.trim() ? chapter.outline.trim() + '\n' : '') + aiOutput.trim()
      get().setOutline(next)
      const { bookDir } = get()
      if (bookDir) {
        await window.api.chapters.save(bookDir, { ...get().chapter!, content: get().content })
        get().showToast('细纲已更新')
      }
    },

    copyOutput: async () => {
      const { aiOutput } = get()
      if (!aiOutput) return
      await navigator.clipboard.writeText(aiOutput)
      get().showToast('已复制到剪贴板')
    },

    clearAiOutput: () => set({ aiOutput: '', aiError: null, aiLastKind: null }),

    exportTxt: async () => {
      const { bookDir } = get()
      if (!bookDir) return
      const savedPath = await window.api.books.exportTxt(bookDir)
      if (savedPath) get().showToast(`已导出到:${savedPath}`)
    },

    runAutoWrite: async (count) => {
      const { autoWrite, book, bookDir } = get()
      if (autoWrite?.running || !book || !bookDir) return
      /* 只写「待写」且正文为空的章节:状态被点回「待写」但已有正文的章一律跳过,绝不覆盖 */
      const targets = book.chapters
        .filter((m) => m.status === 'todo' && m.wordCount === 0)
        .slice(0, Math.max(1, count))
      if (targets.length === 0) {
        get().showToast(
          '没有可写的空章节:自动连写只写「待写」且字数为 0 的章,已有正文的章不会被覆盖',
          'error'
        )
        return
      }
      set({ autoWrite: { running: true, total: targets.length, done: 0, currentTitle: targets[0].title, stop: false } })
      let done = 0
      for (const meta of targets) {
        if (get().autoWrite?.stop) break
        set({ autoWrite: get().autoWrite ? { ...get().autoWrite!, currentTitle: meta.title } : get().autoWrite })
        await get().selectChapter(meta.id)
        await get().runGenerate('chapter')
        /* 失败(含手动停止、限流)即终止整轮连写 */
        if (get().aiError) break
        const output = get().aiOutput
        if (output.trim()) {
          get().setContent(output.trim())
          await get().saveNow()
        }
        /* 摘要供后续章节的记忆系统使用,失败不中断 */
        await get().runGenerate('summary')
        done++
        set((s) => ({ autoWrite: s.autoWrite ? { ...s.autoWrite, done: s.autoWrite.done + 1 } : s.autoWrite }))
      }
      const stopped = get().autoWrite?.stop ?? false
      set({ autoWrite: null })
      get().showToast(stopped ? `自动连写已停止,完成 ${done}/${targets.length} 章` : `自动连写完成,共 ${done} 章`)
    },

    stopAutoWrite: async () => {
      const aw = get().autoWrite
      if (!aw) return
      set({ autoWrite: { ...aw, stop: true } })
      const request = get().aiRequest
      if (request) await window.api.ai.abort(request.id)
    }
  }
})

/** 全书总字数 */
export function totalWords(book: Book | null): number {
  if (!book) return 0
  return book.chapters.reduce((sum, c) => sum + c.wordCount, 0)
}
