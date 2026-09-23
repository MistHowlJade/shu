import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/* storage.ts 依赖 electron(app/safeStorage/shell):测试环境用桩替换 */
const userDataDir = mkdtempSync(join(tmpdir(), 'ainovel-settings-'))
vi.mock('electron', () => ({
  app: { getPath: (_name: string) => userDataDir },
  safeStorage: { isEncryptionAvailable: () => false },
  shell: {}
}))

import {
  buildExportText,
  countWords,
  normalizeAiSettings,
  sanitizeDirName
} from '../src/main/storage'
import { DEFAULT_AI_SETTINGS, type AppSettings, type Book } from '../src/shared/types'

afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true })
})

describe('countWords 中文字数统计', () => {
  it('去除空白后按字符计数', () => {
    expect(countWords('Hello 世界')).toBe(7)
    expect(countWords('第一行\n第二行')).toBe(6)
    expect(countWords('  空白  处理 \t')).toBe(4)
  })
  it('空文本为 0', () => {
    expect(countWords('')).toBe(0)
    expect(countWords(' \n\t ')).toBe(0)
  })
})

describe('sanitizeDirName 非法字符清理', () => {
  it('剔除 Windows 非法字符与换行', () => {
    expect(sanitizeDirName('书名:第一卷*试用?')).toBe('书名第一卷试用')
    expect(sanitizeDirName('a/b\\c|d<e>f"')).toBe('abcdef')
  })
  it('清理后为空则回退「未命名」', () => {
    expect(sanitizeDirName('???')).toBe('未命名')
    expect(sanitizeDirName('')).toBe('未命名')
  })
})

describe('normalizeAiSettings 旧配置迁移', () => {
  it('空/非法输入返回默认值', () => {
    expect(normalizeAiSettings(null)).toEqual(DEFAULT_AI_SETTINGS)
    expect(normalizeAiSettings('x')).toEqual(DEFAULT_AI_SETTINGS)
  })

  it('旧版扁平结构迁移为单个「默认模型」配置', () => {
    const r = normalizeAiSettings({ baseUrl: 'https://api.x.com/v1', apiKey: 'sk-x', model: 'm1' })
    expect(r.profiles).toHaveLength(1)
    expect(r.profiles[0]).toMatchObject({ id: 'default', baseUrl: 'https://api.x.com/v1', apiKey: 'sk-x', model: 'm1' })
    expect(r.activeProfileId).toBe('default')
  })

  it('新配置列表补全缺失字段,激活项失效时回退第一个', () => {
    const r = normalizeAiSettings({
      activeProfileId: 'ghost',
      profiles: [{ id: 'a', model: 'm-a' }]
    })
    expect(r.profiles[0].name).toBe('m-a')
    expect(r.profiles[0].id).toBe('a')
    expect(r.activeProfileId).toBe('a')
  })

  it('无效的 maxTokens(非正数)被剔除,不影响其余字段', () => {
    const r = normalizeAiSettings({ profiles: [{ id: 'a', name: 'A', baseUrl: 'u', apiKey: 'k', model: 'm', maxTokens: 0 }] })
    expect('maxTokens' in r.profiles[0]).toBe(false)
  })
})

/* ---- buildExportText:用临时书目录真实读盘 ---- */

const tmpRoot = mkdtempSync(join(tmpdir(), 'ainovel-export-'))

function makeBook(): Book {
  return {
    id: 'b1',
    title: '导出测试书',
    author: '某作者',
    genre: '都市',
    description: '简介文本',
    style: 's',
    volumes: [
      { id: 'v1', title: '第一卷', summary: '' },
      { id: 'v2', title: '第二卷', summary: '' }
    ],
    chapters: [
      { id: 'c1', volumeId: 'v1', file: 'ch-0001.json', title: '开局', status: 'done', wordCount: 10, hasSummary: false, updatedAt: 1 },
      { id: 'c2', volumeId: 'v2', file: 'ch-0002.json', title: '空章', status: 'todo', wordCount: 0, hasSummary: false, updatedAt: 2 },
      { id: 'c3', volumeId: 'v2', file: 'ch-0003.json', title: '转折', status: 'done', wordCount: 10, hasSummary: false, updatedAt: 3 }
    ],
    characters: [],
    worldview: { setting: '', powerSystem: '', goldenFinger: '', factions: '', notes: '' },
    items: [],
    createdAt: 1,
    updatedAt: 1
  }
}

beforeAll(() => {
  const bookDir = join(tmpRoot, 'book')
  mkdirSync(join(bookDir, 'chapters'), { recursive: true })
  writeFileSync(join(bookDir, 'book.json'), JSON.stringify(makeBook()), 'utf-8')
  writeFileSync(join(bookDir, 'chapters', 'ch-0001.json'), JSON.stringify({ id: 'c1', title: '开局', content: '第一章正文。' }), 'utf-8')
  writeFileSync(join(bookDir, 'chapters', 'ch-0002.json'), JSON.stringify({ id: 'c2', title: '空章', content: '' }), 'utf-8')
  writeFileSync(join(bookDir, 'chapters', 'ch-0003.json'), JSON.stringify({ id: 'c3', title: '转折', content: '第三章正文。' }), 'utf-8')
})

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

describe('buildExportText 全书导出拼合', () => {
  const bookDir = join(tmpRoot, 'book')

  it('带书名、作者与简介头', () => {
    const text = buildExportText(makeBook(), bookDir)
    expect(text).toContain('《导出测试书》')
    expect(text).toContain('作者:某作者')
    expect(text).toContain('【简介】')
  })

  it('空章跳过但保留章号位(第2章缺席,第3章编号不变)', () => {
    const text = buildExportText(makeBook(), bookDir)
    expect(text).toContain('第1章 开局')
    expect(text).not.toContain('第2章 空章')
    expect(text).toContain('第3章 转折')
  })

  it('卷标题只在该卷第一章前出现一次', () => {
    const text = buildExportText(makeBook(), bookDir)
    expect(text.match(/══════ 第一卷 ══════/g)).toHaveLength(1)
    expect(text.match(/══════ 第二卷 ══════/g)).toHaveLength(1)
    expect(text.indexOf('第一卷')).toBeLessThan(text.indexOf('第1章'))
    expect(text.indexOf('第二卷')).toBeLessThan(text.indexOf('第3章'))
  })

  it('没有任何可导出内容时给出占位提示', () => {
    const emptyDir = join(tmpRoot, 'empty-book')
    mkdirSync(join(emptyDir, 'chapters'), { recursive: true })
    const emptyBook = { ...makeBook(), chapters: [] }
    writeFileSync(join(emptyDir, 'book.json'), JSON.stringify(emptyBook), 'utf-8')
    const text = buildExportText(emptyBook, emptyDir)
    expect(text).toContain('尚无可导出的章节内容')
    expect(existsSync(emptyDir)).toBe(true)
    readFileSync(join(emptyDir, 'book.json'), 'utf-8')
  })
})

/* ---- AppSettings 归一化经由 loadSettings 的加密链路已在 settings 桩下覆盖 seal/open 回退明文 ---- */

describe('设置文件读写(safeStorage 不可用时明文回退)', () => {
  it('saveSettings/loadSettings 往返保持字段', async () => {
    const { loadSettings, saveSettings } = await import('../src/main/storage')
    const base = loadSettings()
    const next: AppSettings = { ...base, libraryRoot: tmpRoot, autoScan: false }
    saveSettings(next)
    const loaded = loadSettings()
    expect(loaded.libraryRoot).toBe(tmpRoot)
    expect(loaded.autoScan).toBe(false)
    expect(loaded.ai.profiles.length).toBeGreaterThanOrEqual(1)
  })
})
