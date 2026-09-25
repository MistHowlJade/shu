import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AiResult, AppSettings, Book, Chapter, ChapterMeta, ChatMessage, CreateBookInfo, ScanChapterResult } from '../shared/types'

const api = {
  settings: {
    load: (): Promise<AppSettings> => ipcRenderer.invoke('settings:load'),
    save: (settings: AppSettings): Promise<boolean> => ipcRenderer.invoke('settings:save', settings)
  },
  dialog: {
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder')
  },
  importer: {
    openTxt: (): Promise<{ name: string; text: string } | null> => ipcRenderer.invoke('import:openTxt'),
    fetchUrl: (url: string): Promise<{ ok: boolean; text?: string; error?: string }> =>
      ipcRenderer.invoke('import:fetchUrl', url)
  },
  books: {
    list: (): Promise<{ dir: string; book: Book; broken?: boolean }[]> => ipcRenderer.invoke('books:list'),
    create: (info: CreateBookInfo): Promise<{ dir: string; book: Book }> =>
      ipcRenderer.invoke('books:create', info),
    save: (dir: string, book: Book): Promise<Book> => ipcRenderer.invoke('books:save', dir, book),
    remove: (dir: string): Promise<void> => ipcRenderer.invoke('books:delete', dir),
    exportTxt: (dir: string): Promise<string | null> => ipcRenderer.invoke('books:exportTxt', dir),
    /** 备份整本书;force=false 时 24 小时内已有快照则跳过(每日自动备份用) */
    backup: (dir: string, force: boolean): Promise<{ skipped: boolean; reason?: 'empty' | 'recent'; snapshotDir?: string }> =>
      ipcRenderer.invoke('books:backup', dir, force),
    /** 在资源管理器中打开备份目录 */
    openBackups: (): Promise<boolean> => ipcRenderer.invoke('books:openBackups')
  },
  chapters: {
    read: (dir: string, chapterId: string): Promise<Chapter | null> =>
      ipcRenderer.invoke('chapters:read', dir, chapterId),
    save: (dir: string, chapter: Chapter): Promise<{ chapter: Chapter; meta: ChapterMeta }> =>
      ipcRenderer.invoke('chapters:save', dir, chapter),
    create: (dir: string, volumeId: string, title: string): Promise<{ chapter: Chapter; meta: ChapterMeta }> =>
      ipcRenderer.invoke('chapters:create', dir, volumeId, title),
    remove: (dir: string, chapterId: string): Promise<boolean> =>
      ipcRenderer.invoke('chapters:delete', dir, chapterId),
    /** 本章历史版本列表(新→旧) */
    history: (dir: string, chapterId: string): Promise<{ file: string; time: number; title: string; wordCount: number }[]> =>
      ipcRenderer.invoke('chapters:history', dir, chapterId),
    /** 读取某份历史版本 */
    readHistory: (dir: string, chapterId: string, file: string): Promise<Chapter | null> =>
      ipcRenderer.invoke('chapters:readHistory', dir, chapterId, file)
  },
  ai: {
    test: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('ai:test'),
    /** 订阅流式增量,返回取消订阅函数 */
    onDelta: (callback: (payload: { requestId: string; delta: string }) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, payload: { requestId: string; delta: string }): void =>
        callback(payload)
      ipcRenderer.on('ai:delta', handler)
      return () => ipcRenderer.removeListener('ai:delta', handler)
    },
    generate: (requestId: string, messages: ChatMessage[]): Promise<AiResult> =>
      ipcRenderer.invoke('ai:generate', { requestId, messages }),
    generateChapter: (input: { requestId: string; dir: string; chapterId: string; intent: string }): Promise<AiResult> =>
      ipcRenderer.invoke('ai:generateChapter', input),
    generateContinue: (input: { requestId: string; dir: string; chapterId: string; textBefore: string }): Promise<AiResult> =>
      ipcRenderer.invoke('ai:continueChapter', input),
    polish: (input: { requestId: string; dir: string; chapterId: string; selection: string }): Promise<AiResult> =>
      ipcRenderer.invoke('ai:polish', input),
    generateOutline: (input: { requestId: string; dir: string; chapterId: string; intent: string }): Promise<AiResult> =>
      ipcRenderer.invoke('ai:generateOutline', input),
    summarize: (input: { requestId: string; dir: string; chapterId: string; intent: string }): Promise<AiResult> =>
      ipcRenderer.invoke('ai:summarize', input),
    generateNames: (input: { requestId: string; dir: string; hint: string }): Promise<AiResult> =>
      ipcRenderer.invoke('ai:generateNames', input),
    generateItem: (input: { requestId: string; dir: string; category: string; hint: string }): Promise<AiResult> =>
      ipcRenderer.invoke('ai:generateItem', input),
    extractItems: (input: { requestId: string; dir: string; chapterId: string; intent: string }): Promise<AiResult> =>
      ipcRenderer.invoke('ai:extractItems', input),
    scanChunk: (input: { requestId: string; chunk: string }): Promise<AiResult> =>
      ipcRenderer.invoke('ai:scanChunk', input),
    scanChapter: (input: { dir: string; chapterId: string }): Promise<ScanChapterResult> =>
      ipcRenderer.invoke('ai:scanChapter', input),
    abort: (requestId: string): Promise<boolean> => ipcRenderer.invoke('ai:abort', requestId)
  },
  app: {
    /* 关窗前的同步兜底保存:阻塞至主进程写完磁盘再卸载页面 */
    flush: (payload: { dir: string | null; book: Book | null; chapter: Chapter | null; content: string }): void => {
      ipcRenderer.sendSync('app:flush', payload)
    },
    /* 隐藏式标题栏:按窗口状态(正常/弹窗压暗/沉浸/书库)同步 Windows 悬浮按钮配色 */
    setThemeColors: (overlay: { color: string; symbolColor: string }): Promise<boolean> =>
      ipcRenderer.invoke('app:setThemeColors', overlay)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
