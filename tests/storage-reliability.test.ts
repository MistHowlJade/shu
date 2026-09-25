import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* vitest 5 的 forks 池在 Windows 上对「内含 await import 的异步 mock 工厂」会硬崩,
   因此工厂保持同步:临时目录推迟到 beforeEach 里创建,工厂只读共享状态 */
const state = vi.hoisted(() => ({ root: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => state.root || join(tmpdir(), 'nv-storage-default') },
  safeStorage: { isEncryptionAvailable: () => false },
  shell: { trashItem: async () => {}, openPath: async () => '' }
}))

import {
  SCHEMA_VERSION,
  createBook,
  createChapter,
  listChapterHistory,
  loadSettings,
  readBook,
  saveBook,
  saveChapter,
  saveSettings,
  snapshotBook
} from '../src/main/storage'

const newLib = (name: string): string => {
  const root = join(state.root, name)
  mkdirSync(root, { recursive: true })
  return root
}

const makeBook = (lib: string, title: string) => {
  const { dir } = createBook(lib, { title, author: '', genre: '', description: '' })
  const book = readBook(dir)!
  return { dir, volumeId: book.volumes[0].id }
}

describe('存储可靠层 · schema 版本与迁移', () => {
  beforeEach(() => {
    state.root = mkdtempSync(join(tmpdir(), 'nv-storage-'))
  })

  it('旧版 book.json(无版本号、缺字段)读取时补全并标记 schemaVersion', () => {
    const dir = join(newLib('migrate'), '旧书-abc12345')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'book.json'), JSON.stringify({ id: 'b1', title: '旧书', createdAt: 1, updatedAt: 1 }))

    const book = readBook(dir)
    expect(book).not.toBeNull()
    expect((book as unknown as { schemaVersion: number }).schemaVersion).toBe(SCHEMA_VERSION)
    expect(book!.volumes).toEqual([])
    expect(book!.style.length).toBeGreaterThan(0)
  })

  it('saveBook 落盘带版本号,且无 .tmp 残留(原子替换)', () => {
    const { dir } = makeBook(newLib('atomic'), '原子写')
    saveBook(dir, readBook(dir)!)

    const raw = JSON.parse(readFileSync(join(dir, 'book.json'), 'utf-8'))
    expect(raw.schemaVersion).toBe(SCHEMA_VERSION)
    expect(existsSync(join(dir, 'book.json.tmp'))).toBe(false)
  })
})

describe('存储可靠层 · 损坏章节抢救', () => {
  beforeEach(() => {
    state.root = mkdtempSync(join(tmpdir(), 'nv-storage-'))
  })

  it('章节文件写坏后,saveChapter 先把原始字节抢救进历史目录再覆盖', () => {
    const { dir, volumeId } = makeBook(newLib('corrupt'), '损坏测试')
    const { chapter, meta } = createChapter(dir, { volumeId, title: '第一章' })

    /* 模拟写坏:半个 JSON */
    const chapterPath = join(dir, 'chapters', meta.file)
    writeFileSync(chapterPath, '{"title": "半截', 'utf-8')

    saveChapter(dir, { ...chapter, content: '新正文' })

    /* 历史目录里留下原始坏字节 */
    const hist = join(dir, 'chapters', 'history')
    expect(existsSync(hist)).toBe(true)
    const preserved = readdirSync(hist).filter((n) => n.startsWith(meta.file.replace('.json', '')))
    expect(preserved.length).toBe(1)
    expect(readFileSync(join(hist, preserved[0]), 'utf-8')).toContain('半截')

    /* 历史列表跳过损坏条目;章节文件已是有效新内容 */
    expect(listChapterHistory(dir, chapter.id)).toEqual([])
    expect(JSON.parse(readFileSync(chapterPath, 'utf-8')).content).toBe('新正文')
  })
})

describe('存储可靠层 · 快照与设置', () => {
  beforeEach(() => {
    state.root = mkdtempSync(join(tmpdir(), 'nv-storage-'))
  })

  it('空书快照按 empty 跳过;有内容后强制快照成功', () => {
    const lib = newLib('snapshot')
    const { dir, volumeId } = makeBook(lib, '快照测试')

    expect(snapshotBook(dir, lib, { force: true })).toMatchObject({ skipped: true, reason: 'empty' })

    const { chapter } = createChapter(dir, { volumeId, title: '第一章' })
    saveChapter(dir, { ...chapter, content: '有内容了' })

    const result = snapshotBook(dir, lib, { force: true })
    expect(result.skipped).toBe(false)
    expect(existsSync(result.snapshotDir! + '/book.json')).toBe(true)
  })

  it('设置往返:safeStorage 不可用时明文回退,数据不丢', () => {
    const s = loadSettings()
    s.ai.profiles[0].apiKey = 'sk-roundtrip'
    saveSettings(s)
    expect(loadSettings().ai.profiles[0].apiKey).toBe('sk-roundtrip')
  })
})
