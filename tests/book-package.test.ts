import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdmZip from 'adm-zip'

const state = vi.hoisted(() => ({ root: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => state.root || join(tmpdir(), 'nv-package-default') },
  safeStorage: { isEncryptionAvailable: () => false },
  shell: { trashItem: async () => {}, openPath: async () => '' }
}))

import { createBook, createChapter, readBook, saveChapter } from '../src/main/storage'
import { buildBookPackage, importBookPackage } from '../src/main/package'

const newLib = (name: string): string => {
  const root = join(state.root, name)
  mkdirSync(root, { recursive: true })
  return root
}

const makeBookWithContent = (lib: string, title: string) => {
  const { dir } = createBook(lib, { title, author: '作者甲', genre: '都市爽文', description: '' })
  const book = readBook(dir)!
  const { chapter } = createChapter(dir, { volumeId: book.volumes[0].id, title: '第一章' })
  saveChapter(dir, { ...chapter, content: '这是第一章的正文内容。' })
  return dir
}

describe('工程包 · 导出与导入', () => {
  beforeEach(() => {
    state.root = mkdtempSync(join(tmpdir(), 'nv-package-'))
  })

  it('导出后导入:整本书在新书库完整还原', () => {
    const srcLib = newLib('src')
    const dir = makeBookWithContent(srcLib, '换机之书')

    const zipPath = join(state.root, '换机之书-工程包.zip')
    const info = buildBookPackage(dir, zipPath)
    expect(info.title).toBe('换机之书')
    expect(info.chapterCount).toBe(1)
    expect(existsSync(zipPath)).toBe(true)

    const dstLib = newLib('dst')
    const imported = importBookPackage(zipPath, dstLib)
    expect(imported.title).toBe('换机之书')
    expect(imported.chapterCount).toBe(1)

    /* 新书目录结构完整:book.json + 章节正文 + 历史目录 + 基线快照 */
    const book = readBook(imported.dir)!
    expect(book.title).toBe('换机之书')
    expect(book.chapters.length).toBe(1)
    expect(book.chapters[0].wordCount).toBeGreaterThan(0)
    expect(readFileSync(join(imported.dir, 'chapters', book.chapters[0].file), 'utf-8')).toContain('第一章的正文内容')
    expect(existsSync(join(dstLib, '_backups'))).toBe(true)
  })

  it('包根目录的杂项文件不会被解压进书目录', () => {
    const zip = new AdmZip()
    zip.addFile('book/book.json', Buffer.from(JSON.stringify({ id: 'x', title: 't', chapters: [] })))
    zip.addFile('random.txt', Buffer.from('noise'))
    const zipPath = join(state.root, 'noise.zip')
    zip.writeZip(zipPath)

    const dstLib = newLib('dst-noise')
    const imported = importBookPackage(zipPath, dstLib)
    expect(existsSync(join(imported.dir, 'random.txt'))).toBe(false)
  })

  it('损坏的书无法导出', () => {
    const lib = newLib('broken')
    const dir = join(lib, '坏书-abc')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'book.json'), '{oops', 'utf-8')
    expect(() => buildBookPackage(dir, join(state.root, 'x.zip'))).toThrow()
  })

  it('缺少 book/book.json 的 zip 会被拒绝', () => {
    const zip = new AdmZip()
    zip.addFile('random.txt', Buffer.from('x'))
    const zipPath = join(state.root, 'bad.zip')
    zip.writeZip(zipPath)
    expect(() => importBookPackage(zipPath, newLib('dst'))).toThrow(/不是有效的书籍工程包/)
  })
})
