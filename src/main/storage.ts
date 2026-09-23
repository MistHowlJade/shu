import { app, safeStorage, shell } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  DEFAULT_AI_PROFILE,
  DEFAULT_AI_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_STYLE_PROMPT,
  EMPTY_WORLDVIEW,
  type AIProfile,
  type AISettings,
  type AppSettings,
  type Book,
  type Chapter,
  type ChapterMeta
} from '../shared/types'

/* ---------------- 基础工具 ---------------- */

/* 加密标记前缀:带前缀的 apiKey 落盘前经过 safeStorage 加密 */
const ENC_PREFIX = 'enc:'

/** 落盘前加密:系统支持时用 safeStorage(DPAPI/Keychain),否则退回明文 */
function sealApiKey(plain: string): string {
  if (!plain) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return ENC_PREFIX + safeStorage.encryptString(plain).toString('base64')
    }
  } catch {
    /* 加密失败按明文保存,避免丢 Key */
  }
  return plain
}

/** 读盘后解密:无法解密(如换了系统用户)时返回空串,用户需重新填写 */
function openApiKey(stored: string): string {
  if (!stored) return ''
  if (!stored.startsWith(ENC_PREFIX)) return stored /* 旧版明文,直接迁移 */
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(ENC_PREFIX.length), 'base64'))
  } catch {
    return ''
  }
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T
  } catch {
    return null
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  /* 先写临时文件再原子替换,避免写入中断电/崩溃留下半个 JSON 导致书籍"凭空消失" */
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmp, file)
}

export function countWords(text: string): number {
  return text.replace(/\s/g, '').length
}

/** 清理书名中不适合作为目录名的字符 */
function sanitizeDirName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\r\n]/g, '').trim()
  return cleaned || '未命名'
}

/* ---------------- 应用设置 ---------------- */

/**
 * 兼容历史设置的 AI 配置归一化:
 * - 旧版扁平结构(baseUrl/apiKey/model)自动迁移为单个「模型配置」
 * - 新版配置列表则补全缺失字段
 */
function normalizeAiSettings(stored: unknown): AISettings {
  const defaults = structuredClone(DEFAULT_AI_SETTINGS)
  if (!stored || typeof stored !== 'object') return defaults
  const legacy = stored as Partial<AISettings> & { baseUrl?: string; apiKey?: string; model?: string }

  const genParams = {
    temperature: legacy.temperature ?? defaults.temperature,
    maxTokens: legacy.maxTokens ?? defaults.maxTokens,
    contextBudgetChars: legacy.contextBudgetChars ?? defaults.contextBudgetChars
  }

  if (Array.isArray(legacy.profiles) && legacy.profiles.length > 0) {
    const profiles: AIProfile[] = legacy.profiles.map((p, i) => ({
      id: p.id || `profile-${i}-${randomUUID().slice(0, 8)}`,
      name: p.name || p.model || `配置${i + 1}`,
      baseUrl: p.baseUrl || '',
      apiKey: p.apiKey || '',
      model: p.model || '',
      ...(typeof p.maxTokens === 'number' && p.maxTokens > 0 ? { maxTokens: p.maxTokens } : {})
    }))
    const active = profiles.some((p) => p.id === legacy.activeProfileId)
    return {
      profiles,
      activeProfileId: active ? (legacy.activeProfileId as string) : profiles[0].id,
      ...genParams
    }
  }

  if (legacy.baseUrl || legacy.apiKey || legacy.model) {
    const profile: AIProfile = {
      id: 'default',
      name: legacy.model || '默认模型',
      baseUrl: legacy.baseUrl || DEFAULT_AI_PROFILE.baseUrl,
      apiKey: legacy.apiKey || '',
      model: legacy.model || DEFAULT_AI_PROFILE.model
    }
    return { profiles: [profile], activeProfileId: 'default', ...genParams }
  }

  return defaults
}

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): AppSettings {
  const stored = readJson<Partial<AppSettings>>(settingsFile())
  if (!stored) return structuredClone(DEFAULT_SETTINGS)
  const settings = {
    ...structuredClone(DEFAULT_SETTINGS),
    ...stored,
    ai: normalizeAiSettings(stored.ai)
  }
  /* 落盘为密文,读入内存/发给渲染端前解密 */
  settings.ai.profiles = settings.ai.profiles.map((p) => ({ ...p, apiKey: openApiKey(p.apiKey) }))
  return settings
}

export function saveSettings(settings: AppSettings): void {
  /* 只加密落盘副本,不影响内存与渲染端持有的明文对象 */
  const toWrite: AppSettings = {
    ...settings,
    ai: {
      ...settings.ai,
      profiles: settings.ai.profiles.map((p) => ({ ...p, apiKey: sealApiKey(p.apiKey) }))
    }
  }
  writeJson(settingsFile(), toWrite)
}

/* ---------------- 书库与书籍 ---------------- */

export function ensureLibraryRoot(settings: AppSettings): string {
  const root = settings.libraryRoot || path.join(app.getPath('documents'), 'AINovelStudio')
  fs.mkdirSync(root, { recursive: true })
  return root
}

export interface BookSummaryInternal {
  dir: string
  book: Book
  broken?: boolean
}

/** book.json 损坏时的占位摘要:仅用于在书库里"看见"这本书,禁止打开与覆盖写入 */
function brokenBookSummary(dir: string, dirName: string): BookSummaryInternal {
  const now = Date.now()
  return {
    dir,
    broken: true,
    book: {
      id: `broken-${dirName}`,
      title: `${dirName}(文件损坏)`,
      author: '',
      genre: '',
      description: '',
      style: DEFAULT_STYLE_PROMPT,
      volumes: [],
      chapters: [],
      characters: [],
      worldview: { ...EMPTY_WORLDVIEW },
      items: [],
      createdAt: now,
      updatedAt: 0
    }
  }
}

/** 旧版 book.json 兼容:补全缺失字段,避免渲染端访问 undefined */
function normalizeBook(book: Book): Book {
  return {
    ...book,
    volumes: book.volumes ?? [],
    chapters: book.chapters ?? [],
    characters: book.characters ?? [],
    worldview: { ...EMPTY_WORLDVIEW, ...(book.worldview ?? {}) },
    items: book.items ?? [],
    style: book.style ?? DEFAULT_STYLE_PROMPT,
    description: book.description ?? '',
    author: book.author ?? '',
    genre: book.genre ?? ''
  }
}

export function listBooks(root: string): BookSummaryInternal[] {
  if (!fs.existsSync(root)) return []
  const result: BookSummaryInternal[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === BACKUPS_DIR_NAME) continue
    const dir = path.join(root, entry.name)
    const book = readBook(dir)
    if (book) {
      result.push({ dir, book })
    } else if (fs.existsSync(path.join(dir, 'book.json'))) {
      /* book.json 存在但读不出来:标记为损坏,而不是静默跳过让书"凭空消失" */
      result.push(brokenBookSummary(dir, entry.name))
    }
  }
  return result.sort((a, b) => b.book.updatedAt - a.book.updatedAt)
}

export function readBook(dir: string): Book | null {
  const book = readJson<Book>(path.join(dir, 'book.json'))
  return book && book.id ? normalizeBook(book) : null
}

export function saveBook(dir: string, book: Book): Book {
  book.updatedAt = Date.now()
  writeJson(path.join(dir, 'book.json'), book)
  return book
}

export interface CreateBookInput {
  title: string
  author: string
  genre: string
  description: string
}

export function createBook(root: string, input: CreateBookInput): BookSummaryInternal {
  const id = randomUUID()
  const dirName = `${sanitizeDirName(input.title)}-${id.slice(0, 8)}`
  const dir = path.join(root, dirName)
  fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true })
  const now = Date.now()
  const book: Book = {
    id,
    title: input.title.trim() || '未命名',
    author: input.author.trim(),
    genre: input.genre.trim() || '都市爽文',
    description: input.description.trim(),
    style: DEFAULT_STYLE_PROMPT,
    volumes: [{ id: randomUUID(), title: '第一卷', summary: '' }],
    chapters: [],
    characters: [],
    worldview: { ...EMPTY_WORLDVIEW },
    items: [],
    createdAt: now,
    updatedAt: now
  }
  writeJson(path.join(dir, 'book.json'), book)
  return { dir, book }
}

export async function deleteBook(dir: string): Promise<void> {
  await shell.trashItem(dir)
}

/* ---------------- 章节 ---------------- */

function chaptersDir(bookDir: string): string {
  return path.join(bookDir, 'chapters')
}

function nextChapterFile(bookDir: string): string {
  const dir = chaptersDir(bookDir)
  fs.mkdirSync(dir, { recursive: true })
  let max = 0
  for (const name of fs.readdirSync(dir)) {
    const m = /^ch-(\d+)\.json$/.exec(name)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `ch-${String(max + 1).padStart(4, '0')}.json`
}

export function readChapter(bookDir: string, chapterId: string): Chapter | null {
  const book = readBook(bookDir)
  const meta = book?.chapters.find((c) => c.id === chapterId)
  if (!meta) return null
  return readJson<Chapter>(path.join(chaptersDir(bookDir), meta.file))
}

export interface SaveChapterResult {
  chapter: Chapter
  meta: ChapterMeta
}

/** 保存章节文件,并同步 book.json 中对应章节的元数据 */
export function saveChapter(bookDir: string, chapter: Chapter): SaveChapterResult {
  const book = readBook(bookDir)
  if (!book) throw new Error('书籍不存在: ' + bookDir)
  const meta = book.chapters.find((c) => c.id === chapter.id)
  if (!meta) throw new Error('章节不存在: ' + chapter.id)

  chapter.updatedAt = Date.now()
  meta.title = chapter.title
  meta.wordCount = countWords(chapter.content)
  meta.hasSummary = chapter.summary.trim().length > 0
  meta.status = meta.status === 'todo' && meta.wordCount > 0 ? 'draft' : meta.status
  meta.updatedAt = chapter.updatedAt

  writeJson(path.join(chaptersDir(bookDir), meta.file), chapter)
  saveBook(bookDir, book)
  return { chapter, meta }
}

export interface CreateChapterInput {
  volumeId: string
  title: string
}

export function createChapter(bookDir: string, input: CreateChapterInput): SaveChapterResult {
  const book = readBook(bookDir)
  if (!book) throw new Error('书籍不存在: ' + bookDir)
  const file = nextChapterFile(bookDir)
  const now = Date.now()
  const chapter: Chapter = {
    id: randomUUID(),
    volumeId: input.volumeId,
    title: input.title.trim() || '新章节',
    outline: '',
    content: '',
    summary: '',
    createdAt: now,
    updatedAt: now
  }
  const meta: ChapterMeta = {
    id: chapter.id,
    volumeId: chapter.volumeId,
    file,
    title: chapter.title,
    status: 'todo',
    wordCount: 0,
    hasSummary: false,
    updatedAt: now
  }
  book.chapters.push(meta)
  saveBook(bookDir, book)
  writeJson(path.join(chaptersDir(bookDir), file), chapter)
  return { chapter, meta }
}

export function deleteChapter(bookDir: string, chapterId: string): void {
  const book = readBook(bookDir)
  if (!book) return
  const idx = book.chapters.findIndex((c) => c.id === chapterId)
  if (idx === -1) return
  const [meta] = book.chapters.splice(idx, 1)
  try {
    fs.rmSync(path.join(chaptersDir(bookDir), meta.file))
  } catch {
    /* 文件缺失时忽略 */
  }
  saveBook(bookDir, book)
}

/** 读取某个章节之前 maxCount 章的完整内容(按书中顺序),用于组装上下文 */
export function readPrecedingChapters(bookDir: string, book: Book, chapterId: string, maxCount: number): Chapter[] {
  const idx = book.chapters.findIndex((c) => c.id === chapterId)
  const start = Math.max(0, idx - maxCount)
  const result: Chapter[] = []
  for (let i = start; i < idx; i++) {
    const meta = book.chapters[i]
    const ch = readJson<Chapter>(path.join(chaptersDir(bookDir), meta.file))
    if (ch) result.push(ch)
  }
  return result
}

/* ---------------- 备份 ---------------- */

/** 书库根目录下的备份总目录(其下按书籍目录名分子目录,每份快照一个子目录) */
export const BACKUPS_DIR_NAME = '_backups'
/** 每本书保留的快照份数,超出时删最旧 */
const KEEP_SNAPSHOTS = 7
/** 快照目录名:snap-YYYYMMDD-HHMMSS */
const SNAP_PATTERN = /^snap-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/
/** 每日自动备份的最小间隔 */
const AUTO_BACKUP_INTERVAL_MS = 24 * 3600 * 1000

function backupsRoot(libraryRoot: string): string {
  return path.join(libraryRoot, BACKUPS_DIR_NAME)
}

function listSnapshots(bookBackups: string): string[] {
  if (!fs.existsSync(bookBackups)) return []
  return fs
    .readdirSync(bookBackups)
    .filter((n) => SNAP_PATTERN.test(n))
    .sort()
}

function snapTime(name: string): Date {
  const m = SNAP_PATTERN.exec(name)
  if (!m) return new Date(0)
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
}

export interface SnapshotResult {
  skipped: boolean
  /** skipped 的原因:empty=书还没有内容;recent=24 小时内已有快照 */
  reason?: 'empty' | 'recent'
  /** 新建的快照目录(或最近一份快照的目录) */
  snapshotDir?: string
}

/** 给整本书拍快照:完整复制书目录(book.json + 全部章节)。force=false 且 24 小时内已有快照时跳过。 */
export function snapshotBook(bookDir: string, libraryRoot: string, opts?: { force?: boolean }): SnapshotResult {
  const book = readBook(bookDir)
  if (!book) throw new Error('书籍不存在或已损坏:' + bookDir)
  if (!book.chapters.some((c) => c.wordCount > 0)) return { skipped: true, reason: 'empty' }

  const bookBackups = path.join(backupsRoot(libraryRoot), path.basename(bookDir))
  fs.mkdirSync(bookBackups, { recursive: true })
  const existing = listSnapshots(bookBackups)

  if (!opts?.force && existing.length > 0) {
    const latest = existing[existing.length - 1]
    if (Date.now() - snapTime(latest).getTime() < AUTO_BACKUP_INTERVAL_MS) {
      return { skipped: true, reason: 'recent', snapshotDir: path.join(bookBackups, latest) }
    }
  }

  const d = new Date()
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  const name = `snap-${p(d.getFullYear(), 4)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  const target = path.join(bookBackups, name)
  fs.cpSync(bookDir, target, { recursive: true })

  const all = listSnapshots(bookBackups)
  for (const old of all.slice(0, Math.max(0, all.length - KEEP_SNAPSHOTS))) {
    fs.rmSync(path.join(bookBackups, old), { recursive: true, force: true })
  }
  return { skipped: false, snapshotDir: target }
}

/** 在资源管理器中打开备份总目录 */
export async function openBackupsFolder(libraryRoot: string): Promise<void> {
  const root = backupsRoot(libraryRoot)
  fs.mkdirSync(root, { recursive: true })
  await shell.openPath(root)
}

/* ---------------- 导出 ---------------- */

export function buildExportText(book: Book, bookDir: string): string {
  const lines: string[] = []
  lines.push(`《${book.title}》`)
  if (book.author) lines.push(`作者:${book.author}`)
  lines.push('')
  if (book.description) {
    lines.push('【简介】')
    lines.push(book.description)
    lines.push('')
  }
  const volumes = new Map(book.volumes.map((v) => [v.id, v]))
  let written = 0
  for (const [index, meta] of book.chapters.entries()) {
    const chapter = readJson<Chapter>(path.join(chaptersDir(bookDir), meta.file))
    if (!chapter || !chapter.content.trim()) continue
    written++
    const volume = volumes.get(meta.volumeId)
    if (volume) lines.push(`\n══════ ${volume.title} ══════\n`)
    // 卷标题只在其第一章前出现一次
    volumes.delete(meta.volumeId)
    /* 章号 = 全书位置(与侧栏/AI 一致);空章保留号位,不重排 */
    lines.push(`第${index + 1}章 ${chapter.title}`)
    lines.push('')
    lines.push(chapter.content.trim())
    lines.push('')
  }
  if (written === 0) lines.push('(尚无可导出的章节内容)')
  return lines.join('\n')
}
