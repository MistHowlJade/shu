import { describe, expect, it } from 'vitest'
import { EMPTY_WORLDVIEW, type AISettings, type Book, type Chapter } from '../src/shared/types'
import { buildConsistencyMessages } from '../src/main/context-builder'

const ai: AISettings = {
  profiles: [],
  activeProfileId: '',
  temperature: 0.8,
  maxTokens: 8192,
  contextBudgetChars: 12000
}

const book: Book = {
  id: 'b1',
  title: '测试书',
  author: '',
  genre: '武侠',
  description: '',
  style: '',
  volumes: [],
  chapters: [],
  characters: [
    {
      id: 'c1',
      name: '陈砚',
      role: '主角',
      personality: '',
      background: '',
      arc: '',
      notes: '',
      appearance: '左撇子',
      abilities: '',
      relations: ''
    }
  ],
  worldview: {
    ...EMPTY_WORLDVIEW,
    powerSystem: '不入流→三流→二流',
    foreshadows: [{ id: 'f1', text: '断剑的来历', resolved: false }]
  },
  items: [],
  createdAt: 1,
  updatedAt: 1
}

const chapter: Chapter = {
  id: 'ch1',
  volumeId: 'v1',
  title: '第一章',
  outline: '',
  content: '陈砚右手持剑,一剑劈开了石门。',
  summary: '',
  createdAt: 1,
  updatedAt: 1
}

describe('buildConsistencyMessages', () => {
  it('包含人物卡/世界观/伏笔清单与本章正文', () => {
    const [, userMsg] = buildConsistencyMessages(book, chapter, ai)
    expect(userMsg.content).toContain('左撇子')
    expect(userMsg.content).toContain('断剑的来历')
    expect(userMsg.content).toContain('不入流→三流→二流')
    expect(userMsg.content).toContain('陈砚右手持剑')
  })

  it('system 提示为一致性审稿角色,不写正文', () => {
    const [system] = buildConsistencyMessages(book, chapter, ai)
    expect(system.role).toBe('system')
    expect(system.content).toContain('一致性审稿')
    expect(system.content).toContain('不要改写')
  })
})
