/** store 切片共用的类型与工具(切片本身按领域拆在 ./base|chapters|codex|ai|inspire|importer) */
import type { GenerateKind } from '@shared/types'

/** 工作区三模式:写作 / 设定中心 / 大纲规划 / 扫书 */
export type WorkspaceMode = 'write' | 'codex' | 'outline' | 'import'

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ---------------- 灵感对话(会话内状态) ---------------- */
export interface InspireMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
}
export interface InspireState {
  msgs: InspireMsg[]
  /** 正在流式接收 */
  busy: boolean
  /** 流式接收中的 assistant 文本(未定稿) */
  stream: string
  error: string | null
  requestId: string | null
}
export function emptyInspire(): InspireState {
  return { msgs: [], busy: false, stream: '', error: null, requestId: null }
}
/* 灵感对话按书持久化到 localStorage:重启后接着聊(只留最近 100 条防止超限) */
const INSPIRE_MAX = 100
function inspireKey(dir: string): string {
  return `ai-novel:inspire:${dir}`
}
export function loadInspire(dir: string): InspireState {
  try {
    const raw = localStorage.getItem(inspireKey(dir))
    if (!raw) return emptyInspire()
    const msgs = JSON.parse(raw) as InspireMsg[]
    return { ...emptyInspire(), msgs: Array.isArray(msgs) ? msgs.slice(-INSPIRE_MAX) : [] }
  } catch {
    return emptyInspire()
  }
}
export function persistInspire(dir: string | null, msgs: InspireMsg[]): void {
  if (!dir) return
  try {
    const key = inspireKey(dir)
    if (msgs.length === 0) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(msgs.slice(-INSPIRE_MAX)))
  } catch {
    /* 存储满/被禁:放弃持久化,不影响本次会话 */
  }
}

/* ---------------- 扫书导入 ---------------- */
export interface ScanItem {
  name: string
  category: string
  grade: string
  effect: string
  origin: string
  location: string
}

export interface ScanCharacter {
  name: string
  role: string
}

export interface ScanResults {
  worldviewText: string
  realms: string[]
  items: ScanItem[]
  characters: ScanCharacter[]
}

export interface ImporterState {
  fileName: string
  text: string
  status: 'idle' | 'analyzing'
  progressCurrent: number
  progressTotal: number
  log: string[]
  stop: boolean
  currentRequestId: string | null
  /** 只扫描前 N 万字,0 = 全部 */
  limitWan: number
  /** 世界观字段的写入方式 */
  worldMode: 'append' | 'replace'
  /**
   * 断点续扫:已成功扫完的段数(下次 startScan 从这里继续)。
   * 与 resumeSig(见 scanSignature)配合使用,文本/限制一变旧断点自动失效。
   */
  resumeIndex: number
  /** 上次扫描的进度签名;空串表示无可续扫的断点 */
  resumeSig: string
  /** 第一遍扫描失败的段号(多为临时限流),供「补扫失败段」定向重试 */
  failedChunks: number[]
  results: ScanResults
}

/**
 * 扫描断点签名:文本内容或"前 N 万字"限制变化后,旧的 resumeIndex
 * 指向的段号不再对应,签名不一致时 startScan 会从头开始。
 */
export function scanSignature(imp: ImporterState, full: string): string {
  return `${imp.fileName}|${imp.text.length}|${full.length}|${imp.limitWan}|${imp.text.slice(0, 40)}|${imp.text.slice(-40)}`
}

/* ---------------- 切片上下文 ---------------- */
import type { StoreState } from '../store'

/** AI 生成请求(进行中时挂在 store 上,供停止按钮定位) */
export interface AIRequest {
  id: string
  kind: GenerateKind
}

/** 切片可用的最小 set/get 签名(与 zustand 的 set/get 兼容) */
export interface SliceCtx {
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void
  get: () => StoreState
}
