import { describe, expect, it } from 'vitest'
import { scanSignature, totalWords, type ImporterState } from '../src/renderer/src/store'
import type { Book } from '../src/shared/types'

function makeImporter(partial: Partial<ImporterState> = {}): ImporterState {
  return {
    fileName: '书.txt',
    text: '正文内容',
    status: 'idle',
    progressCurrent: 0,
    progressTotal: 0,
    log: [],
    stop: false,
    currentRequestId: null,
    limitWan: 0,
    worldMode: 'append',
    resumeIndex: 0,
    resumeSig: '',
    failedChunks: [],
    results: { worldviewText: '', realms: [], items: [], characters: [] },
    ...partial
  }
}

describe('scanSignature 扫描断点签名', () => {
  it('相同输入产生相同签名', () => {
    const imp = makeImporter()
    expect(scanSignature(imp, '正文内容')).toBe(scanSignature(makeImporter(), '正文内容'))
  })

  it('文本内容或扫描限制变化时签名变化(旧断点自动失效)', () => {
    const imp = makeImporter()
    const base = scanSignature(imp, '正文内容')
    expect(scanSignature(makeImporter({ text: '正文内容改' }), '正文内容改')).not.toBe(base)
    expect(scanSignature(makeImporter({ limitWan: 10 }), '正文内容')).not.toBe(base)
    expect(scanSignature(makeImporter({ fileName: '另一本.txt' }), '正文内容')).not.toBe(base)
  })
})

describe('totalWords 全书字数', () => {
  it('空书为 0;按各章字数累加', () => {
    expect(totalWords(null)).toBe(0)
    const book = { chapters: [{ wordCount: 1200 }, { wordCount: 800 }, { wordCount: 0 }] } as unknown as Book
    expect(totalWords(book)).toBe(2000)
  })
})
