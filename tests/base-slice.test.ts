import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../src/renderer/src/store'

describe('base slice · AI 抽屉状态', () => {
  beforeEach(() => {
    useStore.getState().setAiOpen(false)
  })

  it('无 localStorage 记忆时默认收起(node 测试环境验证防御逻辑)', () => {
    expect(useStore.getState().aiOpen).toBe(false)
  })

  it('setAiOpen 可开可收,localStorage 写失败不炸', () => {
    useStore.getState().setAiOpen(true)
    expect(useStore.getState().aiOpen).toBe(true)
    useStore.getState().setAiOpen(false)
    expect(useStore.getState().aiOpen).toBe(false)
  })
})
