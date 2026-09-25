import type { Book } from '@shared/types'

/** 码字热力图:按日累计写作字数(localStorage,随书绑定),供书库年视图展示 */

export interface HeatData {
  lastTotal: number
  daily: Record<string, number>
}

const KEY = (id: string): string => `ai-novel:heat:${id}`

function today(): string {
  return new Date().toLocaleDateString('sv-CN')
}

/** 每次章节落盘后调用:把全书字数增量记到当天(只记增量,删减不计负数) */
export function recordDailyWords(book: Book): void {
  const total = book.chapters.reduce((sum, c) => sum + c.wordCount, 0)
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(book.id)) ?? 'null') as HeatData | null
    /* 首次建档只立基线,不追溯历史 */
    const data: HeatData = raw && typeof raw.lastTotal === 'number' && raw.daily ? raw : { lastTotal: total, daily: {} }
    const delta = Math.max(0, total - data.lastTotal)
    const d = today()
    if (delta > 0) data.daily[d] = (data.daily[d] ?? 0) + delta
    data.lastTotal = Math.max(data.lastTotal, total)
    localStorage.setItem(KEY(book.id), JSON.stringify(data))
  } catch {
    /* localStorage 不可用时静默跳过 */
  }
}

/** 读取某本书的按日写字数据 */
export function readHeatmap(bookId: string): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(bookId)) ?? 'null') as HeatData | null
    return raw?.daily ?? {}
  } catch {
    return {}
  }
}
