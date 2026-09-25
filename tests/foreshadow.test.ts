import { describe, expect, it } from 'vitest'
import { foreshadowKeyword, foreshadowMightResolve } from '../src/shared/text'

describe('伏笔联动关键词', () => {
  it('剥掉叙事后缀提取实体关键词', () => {
    expect(foreshadowKeyword('断剑的来历')).toBe('断剑')
    expect(foreshadowKeyword('玉佩的下落')).toBe('玉佩')
    expect(foreshadowKeyword('身世的真相')).toBe('身世')
    expect(foreshadowKeyword('墙上剑痕的作者')).toBe('墙上剑痕的作者')
  })

  it('正文命中关键词判定为可能回收;短关键词/未命中不误报', () => {
    const content = '陈砚握紧了那柄断剑,剑身遇雪现纹。'
    expect(foreshadowMightResolve('断剑的来历', content)).toBe(true)
    expect(foreshadowMightResolve('玉佩的下落', content)).toBe(false)
    /* 剥完只剩单字(如「它」)时判 false,避免到处误报 */
    expect(foreshadowMightResolve('它的来历', content)).toBe(false)
  })
})
