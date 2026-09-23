import { describe, expect, it } from 'vitest'
import { chunkText, parseJsonLoose } from '../src/shared/text'

describe('chunkText 按段落边界切段', () => {
  it('空文本返回空数组', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   \n  ')).toEqual([])
  })

  it('短文本不切段,返回去空白后的单段', () => {
    expect(chunkText('  一段短文本  ', 100)).toEqual(['一段短文本'])
  })

  it('长文本切成多段,每段不超过 size', () => {
    const text = '字'.repeat(10000)
    const chunks = chunkText(text, 4500)
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(4500)
    expect(chunks.join('')).toBe(text)
  })

  it('优先在段落边界(\\n)断开', () => {
    const half = '字'.repeat(3000)
    const text = `${half}\n${'字'.repeat(3000)}`
    const chunks = chunkText(text, 4500)
    expect(chunks.length).toBe(2)
    expect(chunks[0]).toBe(half)
  })

  it('换行位置太靠前(不足一半)时硬切,不产生空段', () => {
    const text = `短\n${'字'.repeat(6000)}`
    const chunks = chunkText(text, 4500)
    expect(chunks.length).toBe(2)
    expect(chunks.join('')).not.toContain('\n\n')
  })
})

describe('parseJsonLoose 宽松解析 LLM 输出', () => {
  it('解析纯 JSON 对象与数组', () => {
    expect(parseJsonLoose<{ a: number }>('{"a":1}')).toEqual({ a: 1 })
    expect(parseJsonLoose<number[]>('[1,2,3]')).toEqual([1, 2, 3])
  })

  it('剥离 markdown 代码块围栏', () => {
    expect(parseJsonLoose<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(parseJsonLoose<{ a: number }>('```\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('容忍前后夹杂的解释文字', () => {
    expect(parseJsonLoose<{ a: number }>('好的,结果如下:{"a":1} 请查收')).toEqual({ a: 1 })
    expect(parseJsonLoose<number[]>('提取结果:[{"name":"剑"}] 以上')).toEqual([{ name: '剑' }])
  })

  it('含内层数组的对象取完整对象而不是内层数组', () => {
    expect(parseJsonLoose<{ items: number[] }>('开头 {"items":[1,2]} 结尾')).toEqual({ items: [1, 2] })
  })

  it('对象优先于数组候选(按出现位置)', () => {
    const r = parseJsonLoose<{ a: number }>('{"a":1}')
    expect(r).toEqual({ a: 1 })
  })

  it('无法解析时返回 null', () => {
    expect(parseJsonLoose('')).toBeNull()
    expect(parseJsonLoose('这不是 JSON')).toBeNull()
    expect(parseJsonLoose('{"a":1')).toBeNull()
  })
})
