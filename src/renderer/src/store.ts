import { create } from 'zustand'
import type { Book } from '@shared/types'
/* 宽松 JSON 解析与文本切段在主/渲染两侧共用,统一实现 */
export { buildBenchmarkOutline, chunkText, parseJsonLoose, foreshadowKeyword, foreshadowMightResolve } from '@shared/text'

import { baseSlice, type BaseSlice } from './slices/base'
import { chaptersSlice, type ChaptersSlice } from './slices/chapters'
import { codexSlice, type CodexSlice } from './slices/codex'
import { aiSlice, type AISlice } from './slices/ai'
import { inspireSlice, type InspireSlice } from './slices/inspire'
import { importerSlice, type ImporterSlice } from './slices/importer'

/* 组件与测试沿用 store 的旧导入路径:类型与纯工具从这里转发到 slices/types */
export type {
  AIRequest,
  ImporterState,
  InspireMsg,
  InspireState,
  ScanCharacter,
  ScanItem,
  ScanResults,
  WorkspaceMode
} from './slices/types'
export { scanSignature, uid } from './slices/types'

/** 应用状态 = 领域切片的组合(base 骨架 / chapters 章节 / codex 设定 / ai 生成 / inspire 陪聊 / importer 扫书) */
export type StoreState = BaseSlice & ChaptersSlice & CodexSlice & AISlice & InspireSlice & ImporterSlice

export const useStore = create<StoreState>()((set, get) => ({
  ...baseSlice({ set, get }),
  ...chaptersSlice({ set, get }),
  ...codexSlice({ set, get }),
  ...aiSlice({ set, get }),
  ...inspireSlice({ set, get }),
  ...importerSlice({ set, get })
}))

/** 全书总字数 */
export function totalWords(book: Book | null): number {
  if (!book) return 0
  return book.chapters.reduce((sum, c) => sum + c.wordCount, 0)
}

/* 开发模式把 store 挂到 window,供自动化验证(如扫书结果与原文核对)驱动;打包版不含此句 */
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  ;(window as unknown as { __store: typeof useStore }).__store = useStore
}
