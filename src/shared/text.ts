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
  const firstObj = cleaned.indexOf('{')
  const lastObj = cleaned.lastIndexOf('}')
  const firstArr = cleaned.indexOf('[')
  const lastArr = cleaned.lastIndexOf(']')
  const openIdx = [firstObj, firstArr].filter((i) => i !== -1).sort((a, b) => a - b)[0]
  const closeIdx = [lastObj, lastArr].filter((i) => i !== -1).sort((a, b) => b - a)[0]
  const candidates = [cleaned]
  /* 首个括号到末个括号:让 [{...}] 这类单元素数组整体参与解析,而不是落到内层对象 */
  if (openIdx !== undefined && closeIdx !== undefined && closeIdx > openIdx) {
    candidates.push(cleaned.slice(openIdx, closeIdx + 1))
  }
  if (firstObj !== -1 && lastObj > firstObj) candidates.push(cleaned.slice(firstObj, lastObj + 1))
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

/* ---------------- 伏笔联动 ---------------- */

/** 伏笔文本里常见的"叙事后缀":匹配关键词时剥掉,只留实体/事件本身 */
const FORESHADOW_SUFFIX =
  /(的)?(来历|下落|真相|秘密|谜团|身世|由来|原因|去向|用途|结果|代价|源头|归属|结局|解开|答案|身份|作用|伏笔)$/g

/**
 * 从伏笔文本提取匹配关键词:剥掉"的来历/的下落"这类后缀后取剩余主体。
 * 例如「断剑的来历」→「断剑」;「墙上剑痕的作者」→「墙上剑痕的作者」(无后缀可剥则原样)。
 */
export function foreshadowKeyword(text: string): string {
  /* 只剥一层后缀:「身世的真相」剥成「身世」就停,避免把实体本身剥没 */
  const keyword = text.trim().replace(FORESHADOW_SUFFIX, '').trim()
  return keyword
}

/** 本章正文里是否出现了该伏笔的实体/事件(粗判:是否可能已回收,交由作者确认) */
export function foreshadowMightResolve(text: string, content: string): boolean {
  const keyword = foreshadowKeyword(text)
  if (keyword.length < 2) return false
  return content.includes(keyword)
}
