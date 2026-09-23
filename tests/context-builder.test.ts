import { describe, expect, it } from 'vitest'
import {
  buildChapterMessages,
  buildContinueMessages,
  buildNamingMessages,
  buildScanMessages
} from '../src/main/context-builder'
import { DEFAULT_AI_SETTINGS, DEFAULT_STYLE_PROMPT, type Book, type Chapter } from '../src/shared/types'

function makeBook(): Book {
  return {
    id: 'b1',
    title: '测试书',
    author: '作者',
    genre: '玄幻',
    description: '一句话主线',
    style: '',
    volumes: [{ id: 'v1', title: '第一卷', summary: '卷规划内容' }],
    chapters: [
      { id: 'c1', volumeId: 'v1', file: 'ch-0001.json', title: '第一章', status: 'todo', wordCount: 100, hasSummary: true, updatedAt: 1 },
      { id: 'c2', volumeId: 'v1', file: 'ch-0002.json', title: '第二章', status: 'todo', wordCount: 0, hasSummary: false, updatedAt: 2 }
    ],
    characters: [{ id: 'p1', name: '林凡', role: '主角', personality: '坚毅', background: '', arc: '', notes: '' }],
    worldview: {
      setting: '大陆背景',
      powerSystem: '炼气→筑基',
      goldenFinger: '签到系统',
      factions: '',
      notes: ''
    },
    items: [],
    createdAt: 1,
    updatedAt: 1
  }
}

function makeChapter(id: string, content = ''): Chapter {
  return { id, volumeId: 'v1', title: id === 'c2' ? '第二章' : '第一章', outline: '本章细纲内容', content, summary: '', createdAt: 1, updatedAt: 1 }
}

describe('buildChapterMessages 组装生成整章上下文', () => {
  it('包含系统风格指令(空风格回退默认)', () => {
    const [system] = buildChapterMessages(makeBook(), makeChapter('c2'), [], '', DEFAULT_AI_SETTINGS)
    expect(system.role).toBe('system')
    expect(system.content).toBe(DEFAULT_STYLE_PROMPT)
  })

  it('包含书籍信息、世界观、人物、细纲、意图与章号', () => {
    const [, user] = buildChapterMessages(makeBook(), makeChapter('c2'), [], '主角要打脸', DEFAULT_AI_SETTINGS)
    expect(user.content).toContain('《测试书》')
    expect(user.content).toContain('第2章《第二章》')
    expect(user.content).toContain('签到系统')
    expect(user.content).toContain('林凡')
    expect(user.content).toContain('本章细纲内容')
    expect(user.content).toContain('主角要打脸')
  })

  it('携带前情:包含上一章摘要与结尾节选', () => {
    const book = makeBook()
    const prev = { ...makeChapter('c1', '上一章正文结尾句子'), summary: '前情摘要文本' }
    const [, user] = buildChapterMessages(book, makeChapter('c2'), [prev], '', DEFAULT_AI_SETTINGS)
    expect(user.content).toContain('前情摘要文本')
    expect(user.content).toContain('上一章正文结尾句子')
  })

  it('预算裁剪:预算极小时保住高优先级任务块,丢弃低优先级块', () => {
    const book = makeBook()
    book.description = '介'.repeat(2000)
    const tiny = { ...DEFAULT_AI_SETTINGS, contextBudgetChars: 600 }
    const [, user] = buildChapterMessages(book, makeChapter('c2'), [], '', tiny)
    /* 任务块(priority 10)必须保留 */
    expect(user.content).toContain('第2章《第二章》')
    /* 简介块(priority 2,最低优先级)被整体丢弃 */
    expect(user.content).not.toContain('介'.repeat(100))
  })

  it('预算裁剪:低优先级块在剩余空间充足时截断保留而不是丢弃', () => {
    const book = makeBook()
    book.description = '介'.repeat(2000)
    const small = { ...DEFAULT_AI_SETTINGS, contextBudgetChars: 800 }
    const [, user] = buildChapterMessages(book, makeChapter('c2'), [], '', small)
    expect(user.content).toContain('第2章《第二章》')
    /* 截断保留:简介头部在,但整体不超过预算量级 */
    expect(user.content).toContain('介'.repeat(100))
    expect(user.content.length).toBeLessThan(1200)
  })

  it('输出保持原始块顺序,不会因优先级排序错乱', () => {
    const [, user] = buildChapterMessages(makeBook(), makeChapter('c2'), [], '', DEFAULT_AI_SETTINGS)
    const wv = user.content.indexOf('【世界观设定】')
    const chars = user.content.indexOf('【主要人物】')
    const task = user.content.indexOf('请创作')
    expect(wv).toBeGreaterThan(-1)
    expect(chars).toBeGreaterThan(wv)
    expect(task).toBeGreaterThan(chars)
  })
})

describe('buildContinueMessages 续写上下文', () => {
  it('包含正文尾部节选与衔接指令', () => {
    const [, user] = buildContinueMessages(makeBook(), makeChapter('c1', '已有正文内容'), '已有正文内容', DEFAULT_AI_SETTINGS)
    expect(user.content).toContain('已有正文内容')
    expect(user.content).toContain('继续写')
  })

  it('长正文按预算截尾,不整体携带', () => {
    const long = '前'.repeat(100000) + '结尾标记'
    const [, user] = buildContinueMessages(makeBook(), makeChapter('c1', long), long, DEFAULT_AI_SETTINGS)
    expect(user.content).toContain('结尾标记')
    expect(user.content.length).toBeLessThan(100000)
  })
})

describe('buildNamingMessages / buildScanMessages', () => {
  it('起名提示带已有人物去重名单与候选数要求', () => {
    const [, user] = buildNamingMessages(makeBook(), '反派长老')
    expect(user.content).toContain('林凡')
    expect(user.content).toContain('反派长老')
    expect(user.content).toContain('5 个')
  })

  it('扫书提示嵌入原文片段', () => {
    const [, user] = buildScanMessages('这一段是待扫描的小说文本')
    expect(user.content).toContain('这一段是待扫描的小说文本')
    expect(user.content).toContain('"realms"')
  })
})
