import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ root: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => state.root || join(tmpdir(), 'nv-export-default') },
  safeStorage: { isEncryptionAvailable: () => false },
  shell: { trashItem: async () => {}, openPath: async () => '' }
}))

import { buildExportText, buildVolumeExports, createBook, createChapter, readBook, saveBook, saveChapter } from '../src/main/storage'
import { buildBenchmarkOutline } from '../src/shared/text'

const newLib = (name: string): string => {
  const root = join(state.root, name)
  mkdirSync(root, { recursive: true })
  return root
}

/* 两卷三章:卷一 [第一章 完成章, 第二章 草稿],卷二 [第三章 完成章] */
function makeFixture(lib: string): string {
  const { dir } = createBook(lib, { title: '导出测试', author: '作者', genre: '', description: '' })
  const v1 = readBook(dir)!.volumes[0].id
  const c1 = createChapter(dir, { volumeId: v1, title: '第一章' })
  saveChapter(dir, { ...c1.chapter, content: '第一章内容。' })
  saveBook(dir, {
    ...readBook(dir)!,
    chapters: readBook(dir)!.chapters.map((m) => (m.id === c1.meta.id ? { ...m, status: 'done' } : m))
  })
  const c2 = createChapter(dir, { volumeId: v1, title: '第二章' })
  saveChapter(dir, { ...c2.chapter, content: '第二章草稿。' })
  saveBook(dir, { ...readBook(dir)!, volumes: [...readBook(dir)!.volumes, { id: 'v2', title: '第二卷', summary: '' }] })
  const c3 = createChapter(dir, { volumeId: 'v2', title: '第三章' })
  saveChapter(dir, { ...c3.chapter, content: '第二卷内容。' })
  saveBook(dir, {
    ...readBook(dir)!,
    chapters: readBook(dir)!.chapters.map((m) => (m.id === c3.meta.id ? { ...m, status: 'done' } : m))
  })
  return dir
}

describe('TXT 导出增强', () => {
  beforeEach(() => {
    state.root = mkdtempSync(join(tmpdir(), 'nv-export-'))
  })

  it('默认导出全部章节;doneOnly=true 只导完成章', () => {
    const dir = makeFixture(newLib('done'))
    const all = buildExportText(readBook(dir)!, dir)
    expect(all).toContain('第一章内容。')
    expect(all).toContain('第二章草稿。')
    expect(all).toContain('第二卷内容。')

    const done = buildExportText(readBook(dir)!, dir, { doneOnly: true })
    expect(done).toContain('第一章内容。')
    expect(done).not.toContain('第二章草稿。')
    expect(done).toContain('第二卷内容。')
  })

  it('分卷导出:每卷一个 TXT,文件名含卷序与卷名,草稿按需过滤', () => {
    const dir = makeFixture(newLib('volumes'))
    const files = buildVolumeExports(readBook(dir)!, dir)
    expect(files.length).toBe(2)
    expect(files[0].fileName).toContain('第1卷')
    expect(files[0].text).toContain('第一章内容。')
    expect(files[0].text).toContain('第二章草稿。')
    expect(files[1].fileName).toContain('第2卷')
    expect(files[1].text).toContain('第二卷内容。')

    const doneOnly = buildVolumeExports(readBook(dir)!, dir, { doneOnly: true })
    expect(doneOnly[0].text).not.toContain('第二章草稿。')
  })

  it('对标大纲模板:包含世界观/等级/人物/物品与节奏建议', () => {
    const md = buildBenchmarkOutline(
      {
        worldviewText: '大宁王朝,江湖与朝堂并立。',
        realms: ['三流', '二流', '一流'],
        characters: [{ name: '陈砚', role: '主角' }],
        items: [{ name: '断水', category: '武器', grade: '残器' }]
      },
      '风雪夜归人'
    )
    expect(md).toContain('风雪夜归人')
    expect(md).toContain('大宁王朝')
    expect(md).toContain('三流 → 二流 → 一流')
    expect(md).toContain('陈砚(主角)')
    expect(md).toContain('断水[武器]·残器')
    expect(md).toContain('建议卷章节奏')
  })
})
