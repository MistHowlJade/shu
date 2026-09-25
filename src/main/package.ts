import AdmZip from 'adm-zip'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Book } from '../shared/types'
import { copyDir, readBook } from './storage'

/**
 * 整本书工程包(换机迁移):把书目录(book.json + chapters 含历史)打包成单个 zip。
 * 纯 fs/adm-zip 实现,不依赖 electron,可单测。
 */

export interface BookPackageInfo {
  title: string
  chapterCount: number
  /** 导入/导出的目标文件路径 */
  file: string
}

function assertSafeEntry(targetDir: string, entryName: string): string {
  /* 防 zip-slip:解压目标必须落在包根目录内 */
  const resolved = path.resolve(targetDir, entryName)
  if (!resolved.startsWith(path.resolve(targetDir) + path.sep)) {
    throw new Error('工程包内含非法路径: ' + entryName)
  }
  return resolved
}

/** 把整本书导出为工程包 zip */
export function buildBookPackage(bookDir: string, savePath: string): BookPackageInfo {
  const book = readBook(bookDir)
  if (!book) throw new Error('书籍不存在或已损坏: ' + bookDir)

  const zip = new AdmZip()
  zip.addLocalFolder(bookDir, 'book')
  zip.addFile(
    'meta.json',
    Buffer.from(
      JSON.stringify({ kind: 'ainovel-book-package', version: 1, exportedAt: Date.now(), title: book.title }, null, 2),
      'utf-8'
    )
  )
  /* 原子写残留的 .tmp 不打包 */
  for (const entry of [...zip.getEntries()]) {
    if (entry.entryName.endsWith('.tmp')) zip.deleteFile(entry)
  }
  zip.writeZip(savePath)
  return { title: book.title, chapterCount: book.chapters.length, file: savePath }
}

/** 从工程包导入:在 libraryRoot 下创建新书目录(绝不覆盖已有书),返回导入结果 */
export function importBookPackage(zipPath: string, libraryRoot: string): BookPackageInfo & { dir: string } {
  const zip = new AdmZip(zipPath)

  const bookEntry = zip.getEntry('book/book.json')
  if (!bookEntry) throw new Error('工程包缺少 book/book.json,不是有效的书籍工程包')
  const book = JSON.parse(bookEntry.getData().toString('utf-8')) as Book
  if (!book || typeof book.id !== 'string' || !Array.isArray(book.chapters)) {
    throw new Error('工程包内的 book.json 无法解析')
  }

  const stamp = new Date()
    .toISOString()
    .slice(0, 16)
    .replace(/[-:T]/g, '')
  const dirName = `${book.title}-导入-${stamp}`.replace(/[\\/:*?"<>|\r\n]/g, '').trim()
  const target = path.join(libraryRoot, dirName)

  /* 逐条受控解压(过滤 .tmp、防路径穿越) */
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    if (!entry.entryName.startsWith('book/') || entry.entryName.endsWith('.tmp')) continue
    const rel = entry.entryName.slice('book/'.length)
    const dest = assertSafeEntry(target, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, entry.getData())
  }

  /* 导入即拍一份基线快照,进备份时间线 */
  const backups = path.join(libraryRoot, '_backups', path.basename(target))
  fs.mkdirSync(backups, { recursive: true })
  copyDir(target, path.join(backups, 'snap-import'))

  return { title: book.title, chapterCount: book.chapters.length, file: zipPath, dir: target }
}
