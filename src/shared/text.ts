/** 主进程 / 渲染进程共用的文本工具(原先在 ipc.ts 与 store.ts 各有一份,统一到这里) */

/** 按段落边界把长文本切成 AI 扫描片段 */
export function chunkText(text: string, size = 4500): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + size, text.length)
    if (end < text.length) {
      const brk = text.lastIndexOf('\n', end)
      if (brk > start + size * 0.5) end = brk
    }
    const piece = text.slice(start, end).trim()
    if (piece) chunks.push(piece)
    start = end
  }
  return chunks
}

/** 宽松解析 LLM 输出的 JSON(容忍 markdown 代码块与前后杂 text) */
export function parseJsonLoose<T>(text: string): T | null {
  if (!text) return null
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const candidates = [cleaned]
  const firstObj = cleaned.indexOf('{')
  const lastObj = cleaned.lastIndexOf('}')
  if (firstObj !== -1 && lastObj > firstObj) candidates.push(cleaned.slice(firstObj, lastObj + 1))
  const firstArr = cleaned.indexOf('[')
  const lastArr = cleaned.lastIndexOf(']')
  if (firstArr !== -1 && lastArr > firstArr) candidates.push(cleaned.slice(firstArr, lastArr + 1))
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T
    } catch {
      /* 尝试下一个候选 */
    }
  }
  return null
}
