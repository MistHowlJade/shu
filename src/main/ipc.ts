import { app, dialog, ipcMain, type WebContents } from 'electron'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import type {
  AiResult,
  AppSettings,
  Book,
  Chapter,
  ChapterMeta,
  ChatMessage,
  Character,
  CreateBookInfo,
  ItemEntry,
  ScanChapterResult
} from '../shared/types'
import { abortGeneration, chatOnce, streamChat, type ChatEndpoint } from './ai-client'
import {
  buildChapterMessages,
  buildContinueMessages,
  buildItemExtractMessages,
  buildItemMessages,
  buildNamingMessages,
  buildOutlineMessages,
  buildPolishMessages,
  buildScanMessages,
  buildSummaryMessages
} from './context-builder'
import { fetchWebpageText, readTxtFile } from './importer'
import { activeProfile } from '../shared/types'
import { chunkText, parseJsonLoose } from '../shared/text'
import {
  buildExportText,
  createBook,
  createChapter,
  deleteBook,
  deleteChapter,
  ensureLibraryRoot,
  listBooks,
  listChapterHistory,
  loadSettings,
  openBackupsFolder,
  readBook,
  readChapter,
  readChapterSnapshot,
  readPrecedingChapters,
  saveBook,
  saveChapter,
  saveSettings,
  snapshotBook
} from './storage'

/* 流式增量按请求定向回传:不再用模块级 sender 共享,避免多窗口/窗口重建后发错目标 */
function sendDelta(target: WebContents, requestId: string, delta: string): void {
  if (target.isDestroyed()) return
  target.send('ai:delta', { requestId, delta })
}

/** 按段落边界把章节正文切成扫描片段(实现见 shared/text) */
const chunkContent = chunkText

/** 主进程侧宽松 JSON 解析(实现见 shared/text) */
const parseLoose = parseJsonLoose

interface GenerateRequest {
  requestId: string
  messages: ChatMessage[]
}

async function runGeneration(req: GenerateRequest, target: WebContents): Promise<AiResult> {
  const settings = loadSettings()
  const endpoint: ChatEndpoint = activeProfile(settings.ai)
  try {
    const text = await streamChat({
      requestId: req.requestId,
      endpoint,
      messages: req.messages,
      temperature: settings.ai.temperature,
      maxTokens: endpoint.maxTokens ?? settings.ai.maxTokens,
      onDelta: (delta) => sendDelta(target, req.requestId, delta)
    })
    return { ok: true, text }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === 'ABORTED') return { ok: false, error: '已停止生成', text: '' }
    return { ok: false, error: message }
  }
}

/** 校验目录确实是书籍目录(必须含 book.json),防止渲染层把任意路径传给写盘/删除接口 */
function assertBookDir(dir: string): string {
  const resolved = path.resolve(dir)
  if (!fs.existsSync(path.join(resolved, 'book.json'))) {
    throw new Error('非法的书籍目录:' + dir)
  }
  return resolved
}

function requireBook(dir: string): Book {
  const book = readBook(dir)
  if (!book) throw new Error('书籍不存在或已损坏:' + dir)
  return book
}

function requireChapter(book: Book, chapterId: string): ChapterMeta {
  const meta = book.chapters.find((c) => c.id === chapterId)
  if (!meta) throw new Error('章节不存在:' + chapterId)
  return meta
}

interface GenChapterInput {
  requestId?: string
  dir: string
  chapterId: string
  intent: string
}

export function registerIpcHandlers(): void {
  /* ---- 设置 ---- */
  ipcMain.handle('settings:load', () => loadSettings())
  ipcMain.handle('settings:save', (_e, settings: AppSettings) => {
    saveSettings(settings)
    return true
  })
  ipcMain.handle('dialog:pickFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  /* ---- 书籍 ---- */
  ipcMain.handle('books:list', () => {
    const settings = loadSettings()
    const root = ensureLibraryRoot(settings)
    return listBooks(root)
  })
  ipcMain.handle('books:create', (_e, info: CreateBookInfo) => {
    const settings = loadSettings()
    const root = ensureLibraryRoot(settings)
    return createBook(root, info)
  })
  /* 乐观写:渲染层可能持有比磁盘旧的副本(主进程 summarize 刚写过章节 meta),
     整体覆盖会把刚生成的摘要标记等回滚。冲突时以渲染层为底,采纳磁盘上较新的 meta/条目。 */
  ipcMain.handle('books:save', (_e, dir: string, book: Book) => {
    const target = assertBookDir(dir)
    const disk = readBook(target)
    if (disk && disk.updatedAt > book.updatedAt) {
      const diskMeta = new Map(disk.chapters.map((c) => [c.id, c]))
      book.chapters = book.chapters.map((c) => {
        const newer = diskMeta.get(c.id)
        return newer && newer.updatedAt > c.updatedAt ? newer : c
      })
      const known = new Set(book.chapters.map((c) => c.id))
      book.chapters.push(...disk.chapters.filter((c) => !known.has(c.id)))
      const volIds = new Set(book.volumes.map((v) => v.id))
      book.volumes.push(...disk.volumes.filter((v) => !volIds.has(v.id)))
      book.updatedAt = disk.updatedAt
    }
    return saveBook(target, book)
  })
  ipcMain.handle('books:delete', (_e, dir: string) => deleteBook(assertBookDir(dir)))
  /* 手动备份(force)/每日自动备份(非 force,24 小时内已有快照则跳过) */
  ipcMain.handle('books:backup', (_e, dir: string, force: boolean) => {
    const settings = loadSettings()
    const root = ensureLibraryRoot(settings)
    return snapshotBook(assertBookDir(dir), root, { force })
  })
  ipcMain.handle('books:openBackups', async () => {
    const settings = loadSettings()
    await openBackupsFolder(ensureLibraryRoot(settings))
    return true
  })
  ipcMain.handle('books:exportTxt', async (_e, dir: string) => {
    const book = requireBook(assertBookDir(dir))
    const result = await dialog.showSaveDialog({
      title: '导出全书 TXT',
      defaultPath: path.join(app.getPath('documents'), `${book.title}.txt`),
      filters: [{ name: '文本文件', extensions: ['txt'] }]
    })
    if (result.canceled || !result.filePath) return null
    fs.writeFileSync(result.filePath, buildExportText(book, dir), 'utf-8')
    return result.filePath
  })

  /* ---- 章节 ---- */
  ipcMain.handle('chapters:read', (_e, dir: string, chapterId: string) =>
    readChapter(assertBookDir(dir), chapterId)
  )
  ipcMain.handle('chapters:save', (_e, dir: string, chapter: Chapter) => {
    const { chapter: saved, meta } = saveChapter(assertBookDir(dir), chapter)
    return { chapter: saved, meta }
  })
  ipcMain.handle('chapters:create', (_e, dir: string, volumeId: string, title: string) =>
    createChapter(assertBookDir(dir), { volumeId, title })
  )
  ipcMain.handle('chapters:delete', (_e, dir: string, chapterId: string) => {
    deleteChapter(assertBookDir(dir), chapterId)
    return true
  })
  ipcMain.handle('chapters:history', (_e, dir: string, chapterId: string) =>
    listChapterHistory(assertBookDir(dir), chapterId)
  )
  ipcMain.handle('chapters:readHistory', (_e, dir: string, chapterId: string, file: string) =>
    readChapterSnapshot(assertBookDir(dir), chapterId, file)
  )

  /* 关窗前的同步兜底保存(beforeunload 里 sendSync 调用):尽力写完未落盘的编辑 */
  ipcMain.on(
    'app:flush',
    (
      _e,
      payload: { dir: string | null; book: Book | null; chapter: Chapter | null; content: string }
    ) => {
      try {
        if (!payload?.dir || !payload.book) return
        const dir = assertBookDir(payload.dir)
        /* 先写书级设定(细纲/简介等未保存编辑),再写当前章节正文与它的 meta */
        saveBook(dir, payload.book)
        if (payload.chapter) saveChapter(dir, { ...payload.chapter, content: payload.content })
      } catch {
        /* 关窗阶段尽力而为,失败不阻塞退出 */
      }
    }
  )

  /* ---- AI ---- */
  ipcMain.handle('ai:test', async () => {
    const settings = loadSettings()
    try {
      const { ms } = await chatOnce(activeProfile(settings.ai), '回复"连接成功"四个字')
      return { ok: true, message: `连接成功(${ms}ms)` }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('ai:generate', (_e, req: GenerateRequest): Promise<AiResult> => {
    return runGeneration(req, _e.sender)
  })
  ipcMain.handle('ai:abort', (_e, requestId: string) => {
    abortGeneration(requestId)
    return true
  })

  /** 生成整章初稿 */
  ipcMain.handle('ai:generateChapter', async (_e, input: GenChapterInput): Promise<AiResult> => {

    try {
      const book = requireBook(input.dir)
      const chapter = readChapter(input.dir, input.chapterId)
      if (!chapter) throw new Error('章节不存在')
      const prev = readPrecedingChapters(input.dir, book, input.chapterId, 10)
      const settings = loadSettings()
      const messages = buildChapterMessages(book, chapter, prev, input.intent, settings.ai)
      return await runGeneration({ requestId: input.requestId ?? randomUUID(), messages }, _e.sender)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  /** 续写当前章节(textBefore 为光标前/章末的已有正文) */
  ipcMain.handle('ai:continueChapter', async (_e, input: { requestId?: string; dir: string; chapterId: string; textBefore: string }): Promise<AiResult> => {

    try {
      const book = requireBook(input.dir)
      const chapter = readChapter(input.dir, input.chapterId)
      if (!chapter) throw new Error('章节不存在')
      if (!input.textBefore?.trim()) throw new Error('本章还没有内容,请先写一段或用「生成整章」')
      const settings = loadSettings()
      const messages = buildContinueMessages(book, chapter, input.textBefore, settings.ai)
      return await runGeneration({ requestId: input.requestId ?? randomUUID(), messages }, _e.sender)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  /** 润色选中片段 */
  ipcMain.handle(
    'ai:polish',
    async (_e, input: { requestId?: string; dir: string; chapterId: string; selection: string }): Promise<AiResult> => {

    try {
      const book = requireBook(input.dir)
      const settings = loadSettings()
      const messages = buildPolishMessages(book, input.selection, settings.ai)
      return await runGeneration({ requestId: input.requestId ?? randomUUID(), messages }, _e.sender)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  /** 生成本章细纲 */
  ipcMain.handle('ai:generateOutline', async (_e, input: GenChapterInput): Promise<AiResult> => {

    try {
      const book = requireBook(input.dir)
      const chapter = readChapter(input.dir, input.chapterId)
      if (!chapter) throw new Error('章节不存在')
      const prev = readPrecedingChapters(input.dir, book, input.chapterId, 3)
      const settings = loadSettings()
      const messages = buildOutlineMessages(book, chapter, prev, input.intent, settings.ai)
      return await runGeneration({ requestId: input.requestId ?? randomUUID(), messages }, _e.sender)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  /** 生成前情摘要并写回章节 */
  ipcMain.handle('ai:summarize', async (_e, input: GenChapterInput): Promise<AiResult> => {

    try {
      const book = requireBook(input.dir)
      const chapter = readChapter(input.dir, input.chapterId)
      if (!chapter) throw new Error('章节不存在')
      if (!chapter.content.trim()) throw new Error('本章还没有正文,无法生成摘要')
      const settings = loadSettings()
      const messages = buildSummaryMessages(book, chapter, settings.ai)
      const result = await runGeneration({ requestId: input.requestId ?? randomUUID(), messages }, _e.sender)
      if (result.ok && result.text) {
        chapter.summary = result.text.trim()
        saveChapter(assertBookDir(input.dir), chapter)
      }
      return result
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  /** 为角色起名,返回候选名(换行分隔) */
  ipcMain.handle('ai:generateNames', async (_e, input: { requestId?: string; dir: string; hint: string }): Promise<AiResult> => {

    try {
      const book = requireBook(input.dir)
      const messages = buildNamingMessages(book, input.hint ?? '')
      return await runGeneration({ requestId: input.requestId ?? randomUUID(), messages }, _e.sender)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  /** 生成一张物品卡,返回 JSON 对象文本 */
  ipcMain.handle(
    'ai:generateItem',
    async (_e, input: { requestId?: string; dir: string; category: string; hint: string }): Promise<AiResult> => {
  
      try {
        const book = requireBook(input.dir)
        const settings = loadSettings()
        const messages = buildItemMessages(book, input.category ?? '', input.hint ?? '', settings.ai)
        return await runGeneration({ requestId: input.requestId ?? randomUUID(), messages }, _e.sender)
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  /** 从当前章节提取阶段性物品,返回 JSON 数组文本 */
  ipcMain.handle('ai:extractItems', async (_e, input: GenChapterInput): Promise<AiResult> => {

    try {
      const book = requireBook(input.dir)
      const chapter = readChapter(input.dir, input.chapterId)
      if (!chapter) throw new Error('章节不存在')
      if (!chapter.content.trim()) throw new Error('本章还没有正文,无法提取')
      const settings = loadSettings()
      const messages = buildItemExtractMessages(book, chapter, settings.ai)
      return await runGeneration({ requestId: input.requestId ?? randomUUID(), messages }, _e.sender)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  /** 扫书:对单个文本片段做设定提取,返回 JSON 对象文本 */
  ipcMain.handle('ai:scanChunk', async (_e, input: { requestId?: string; chunk: string }): Promise<AiResult> => {

    try {
      if (!input.chunk?.trim()) throw new Error('文本片段为空')
      const messages = buildScanMessages(input.chunk)
      return await runGeneration({ requestId: input.requestId ?? randomUUID(), messages }, _e.sender)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  /** 自动设定检测:扫描本章正文,提取新人物/物品/境界/世界观增量。
   * 只返回增量、不写 book.json:book.json 的写入者收敛到渲染层(persistBook)与章节保存,
   * 避免主进程用旧内存副本覆盖渲染层的编辑、或跨书污染。 */
  ipcMain.handle(
    'ai:scanChapter',
    async (_e, input: { dir: string; chapterId: string }): Promise<ScanChapterResult> => {
      const empty = {
        newCharacters: 0,
        newItems: 0,
        newRealms: 0,
        worldAdded: false,
        addedCharacters: [] as Character[],
        addedItems: [] as ItemEntry[],
        addedRealms: [] as string[],
        addedWorldLines: [] as string[]
      }
      try {
        const settings = loadSettings()
        assertBookDir(input.dir)
        const book = requireBook(input.dir)
        const chapter = readChapter(input.dir, input.chapterId)
        if (!chapter || !chapter.content.trim())
          return { ok: false, error: '本章没有正文', ...empty }
        const endpoint: ChatEndpoint = activeProfile(settings.ai)

        const addedCharacters: Character[] = []
        const addedItems: ItemEntry[] = []
        const addedRealms: string[] = []
        const addedWorldLines: string[] = []
        const itemNames = new Set(book.items.map((it) => it.name.trim()))
        const charNames = new Set(book.characters.map((c) => c.name.trim()))
        const chapterIndex = book.chapters.findIndex((m) => m.id === chapter.id) + 1
        const stage = chapterIndex > 0 ? `第${chapterIndex}章自动检测` : '自动检测'

        for (const chunk of chunkContent(chapter.content)) {
          let text: string
          try {
            text = await streamChat({
              requestId: randomUUID(),
              endpoint,
              messages: buildScanMessages(chunk),
              temperature: settings.ai.temperature,
              maxTokens: endpoint.maxTokens ?? settings.ai.maxTokens
            })
          } catch {
            continue /* 单段失败跳过,不中断整次检测 */
          }
          const parsed = parseLoose<{
            worldview?: string
            realms?: string[]
            items?: Partial<ItemEntry>[]
            characters?: { name?: string; role?: string }[]
          }>(text)
          if (!parsed) continue

          const wv = parsed.worldview?.trim()
          if (
            wv &&
            !book.worldview.setting.includes(wv.slice(0, 30)) &&
            !addedWorldLines.some((l) => l.includes(wv.slice(0, 30)) || wv.includes(l.slice(0, 30)))
          ) {
            addedWorldLines.push(wv)
          }
          for (const realm of parsed.realms ?? []) {
            const t = realm.trim()
            if (t && !book.worldview.powerSystem.includes(t) && !addedRealms.includes(t)) {
              addedRealms.push(t)
            }
          }
          for (const it of parsed.items ?? []) {
            const name = it.name?.trim()
            if (!name || itemNames.has(name)) continue
            itemNames.add(name)
            addedItems.push({
              id: randomUUID(),
              name,
              category: it.category?.trim() || '其他',
              grade: it.grade?.trim() ?? '',
              appearance: '',
              effect: it.effect?.trim() ?? '',
              origin: it.origin?.trim() ?? '',
              location: it.location?.trim() ?? '',
              owner: it.owner?.trim() ?? '',
              stage,
              notes: ''
            })
          }
          for (const c of parsed.characters ?? []) {
            const name = c.name?.trim()
            if (!name || charNames.has(name)) continue
            charNames.add(name)
            addedCharacters.push({
              id: randomUUID(),
              name,
              role: c.role?.trim() ?? '',
              personality: '',
              background: '',
              arc: '',
              notes: ''
            })
          }
        }

        return {
          ok: true,
          newCharacters: addedCharacters.length,
          newItems: addedItems.length,
          newRealms: addedRealms.length,
          worldAdded: addedWorldLines.length > 0,
          addedCharacters,
          addedItems,
          addedRealms,
          addedWorldLines
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err), ...empty }
      }
    }
  )

  /* ---- 扫书导入 ---- */
  ipcMain.handle('import:openTxt', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择要拆解的小说文本',
      filters: [
        { name: '文本文件', extensions: ['txt'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const { name, text } = readTxtFile(result.filePaths[0])
    return { name, text }
  })

  ipcMain.handle('import:fetchUrl', async (_e, url: string) => {
    try {
      return { ok: true, text: await fetchWebpageText(url) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
