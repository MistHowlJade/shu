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
    exportTxt: (dir: string, opts?: { doneOnly?: boolean }): Promise<string | null> =>
      ipcRenderer.invoke('books:exportTxt', dir, opts),
    /** 分卷导出:每卷一个 TXT 到所选目录 */
    exportVolumes: (dir: string, opts?: { doneOnly?: boolean }): Promise<{ dir: string; files: string[] } | null> =>
      ipcRenderer.invoke('books:exportVolumes', dir, opts),
    /** 备份整本书;force=false 时 24 小时内已有快照则跳过(每日自动备份用) */
    backup: (dir: string, force: boolean): Promise<{ skipped: boolean; reason?: 'empty' | 'recent'; snapshotDir?: string }> =>
      ipcRenderer.invoke('books:backup', dir, force),
    /** 在资源管理器中打开备份目录 */
    openBackups: (): Promise<boolean> => ipcRenderer.invoke('books:openBackups'),
    /** 导出整本书工程包(zip:章节+设定+历史),返回包信息或 null(取消) */
    exportPackage: (dir: string): Promise<{ title: string; chapterCount: number; file: string } | null> =>
      ipcRenderer.invoke('books:exportPackage', dir),
    /** 导入工程包到书库(创建新书,不覆盖已有书),返回导入结果或 null(取消) */
    importPackage: (): Promise<{ title: string; chapterCount: number; dir: string; file: string } | null> =>
      ipcRenderer.invoke('books:importPackage'),
    /** 列出这本书的备份快照(新→旧) */
    snapshots: (dir: string): Promise<{ name: string; time: number; chapterCount: number }[]> =>
      ipcRenderer.invoke('books:snapshots', dir),
    /** 全书搜索:标题/细纲/摘要/正文 */
    searchBook: (dir: string, query: string): Promise<{ chapterId: string; title: string; where: string; snippet: string; count: number }[]> =>
      ipcRenderer.invoke('search:book', dir, query),
    /** 恢复到某个快照(恢复前自动拍「恢复前」兜底快照) */
    restoreSnapshot: (dir: string, name: string): Promise<Book> =>
      ipcRenderer.invoke('books:restoreSnapshot', dir, name)
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
    generateConsistency: (input: { requestId?: string; dir: string; chapterId: string }): Promise<AiResult> =>
      ipcRenderer.invoke('ai:generateConsistency', input),
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
    /** 通用文本保存(保存对话框) */
    saveTextFile: (payload: { defaultPath: string; content: string; filterName?: string }): Promise<string | null> =>
      ipcRenderer.invoke('app:saveTextFile', payload),
    /* 隐藏式标题栏:按窗口状态(正常/弹窗压暗/沉浸/书库)同步 Windows 悬浮按钮配色 */
    setThemeColors: (overlay: { color: string; symbolColor: string }): Promise<boolean> =>
      ipcRenderer.invoke('app:setThemeColors', overlay)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
