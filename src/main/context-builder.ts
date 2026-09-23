import type {
  AISettings,
  Book,
  Chapter,
  ChatMessage
} from '../shared/types'
import { DEFAULT_STYLE_PROMPT } from '../shared/types'

/** 从文本尾部截取 n 个字符(按段落边界优先) */
function tail(text: string, n: number): string {
  const t = text.trim()
  if (t.length <= n) return t
  const cut = t.slice(-n)
  const brk = cut.indexOf('\n')
  return brk > 0 ? cut.slice(brk + 1) : cut
}

interface Block {
  text: string
  /** 优先级,数字越大越晚被裁剪 */
  priority: number
}

/**
 * 按字符预算组装信息块:超出预算时从优先级最低的块开始整体丢弃,
 * 单块超长时截断到剩余空间的 60%(至少 500 字)。
 * 用下标记录保留项,输出时还原原始顺序(按文本匹配会在重复文本时错乱)。
 */
function assembleBlocks(blocks: Block[], budget: number): string {
  let remaining = budget
  const kept = new Map<number, string>()
  const byPriority = blocks.map((_, i) => i).sort((a, b) => blocks[b].priority - blocks[a].priority)
  for (const i of byPriority) {
    if (remaining <= 500) break
    let text = blocks[i].text
    if (text.length > remaining) text = text.slice(0, Math.max(500, Math.floor(remaining * 0.6)))
    remaining -= text.length
    kept.set(i, text)
  }
  const parts: string[] = []
  blocks.forEach((_, i) => {
    const text = kept.get(i)
    if (text !== undefined) parts.push(text)
  })
  return parts.join('\n\n').trim()
}

export function stylePromptOf(book: Book): string {
  return book.style.trim() || DEFAULT_STYLE_PROMPT
}

/** 生成整章初稿的上下文 */
export function buildChapterMessages(
  book: Book,
  chapter: Chapter,
  prevChapters: Chapter[],
  intent: string,
  ai: AISettings
): ChatMessage[] {
  const system = stylePromptOf(book)

  const blocks: Block[] = []
  blocks.push({
    text: `【作品信息】\n书名《${book.title}》 类型:${book.genre}${book.author ? ' 作者:' + book.author : ''}\n【全书简介】\n${book.description || '(暂无)'}`,
    priority: 2
  })

  const w = book.worldview
  const worldParts: string[] = []
  if (w.setting.trim()) worldParts.push('世界背景:' + w.setting.trim())
  if (w.powerSystem.trim()) worldParts.push('力量/等级体系:' + w.powerSystem.trim())
  if (w.goldenFinger.trim()) worldParts.push('主角金手指:' + w.goldenFinger.trim())
  if (w.factions.trim()) worldParts.push('势力阵营:' + w.factions.trim())
  if (w.notes.trim()) worldParts.push('其他设定:' + w.notes.trim())
  if (worldParts.length > 0) {
    blocks.push({ text: '【世界观设定】\n' + worldParts.join('\n'), priority: 5 })
  }

  const chars = book.characters.filter((c) => c.name.trim())
  if (chars.length > 0) {
    const lines = chars.map((c) => {
      const parts = [`${c.name}${c.role ? '(' + c.role + ')' : ''}`]
      if (c.personality.trim()) parts.push('性格:' + c.personality.trim())
      if (c.background.trim()) parts.push('背景:' + c.background.trim())
      if (c.arc.trim()) parts.push('成长线:' + c.arc.trim())
      if (c.notes.trim()) parts.push('备注:' + c.notes.trim())
      return '- ' + parts.join(';')
    })
    blocks.push({ text: '【主要人物】\n' + lines.join('\n'), priority: 6 })
  }

  const items = (book.items ?? []).filter((it) => it.name?.trim())
  if (items.length > 0) {
    const lines = items.map((it) => {
      const head = `${it.name}(${[it.category, it.grade].filter(Boolean).join('·') || '物品'})`
      const parts = [head]
      if (it.effect?.trim()) parts.push('效果:' + it.effect.trim())
      if (it.origin?.trim()) parts.push('获取方式:' + it.origin.trim())
      if (it.location?.trim()) parts.push('获取地点:' + it.location.trim())
      if (it.owner?.trim()) parts.push('当前持有:' + it.owner.trim())
      return '- ' + parts.join(';')
    })
    blocks.push({ text: '【重要物品(保持名称、品级与效果一致)】\n' + lines.join('\n'), priority: 5 })
  }

  const volumes = book.volumes.filter((v) => v.summary.trim())
  if (volumes.length > 0) {
    blocks.push({
      text: '【各卷剧情规划】\n' + volumes.map((v) => `${v.title}:${v.summary.trim()}`).join('\n'),
      priority: 3
    })
  }

  if (prevChapters.length > 0) {
    const summaryLines = prevChapters.map((c) => {
      const index = book.chapters.findIndex((m) => m.id === c.id) + 1
      return `第${index}章《${c.title}》:${c.summary.trim() || '(无摘要)'}`
    })
    blocks.push({ text: '【前情摘要】\n' + summaryLines.join('\n'), priority: 4 })
  }

  const last = prevChapters[prevChapters.length - 1]
  if (last && last.content.trim()) {
    blocks.push({ text: `【上一章(${last.title})结尾节选】\n……${tail(last.content, 2500)}`, priority: 7 })
  }

  const chapterIndex = book.chapters.findIndex((m) => m.id === chapter.id) + 1
  let task = `请创作《${book.title}》第${chapterIndex}章《${chapter.title}》的完整正文,约2000-3000字。`
  if (chapter.outline.trim()) task += `\n【本章细纲】\n${chapter.outline.trim()}`
  if (intent.trim()) task += `\n【本章写作意图】\n${intent.trim()}`
  task += '\n要求:直接输出正文内容,不要输出章节标题、序号或任何说明文字。'
  blocks.push({ text: task, priority: 10 })

  const user = assembleBlocks(blocks, ai.contextBudgetChars)
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

/** 续写当前章节的上下文(textBefore 为已有的正文,可为整章或光标前的部分) */
export function buildContinueMessages(book: Book, chapter: Chapter, textBefore: string, ai: AISettings): ChatMessage[] {
  const system = stylePromptOf(book)
  const blocks: Block[] = []
  if (chapter.outline.trim()) blocks.push({ text: `【本章细纲】\n${chapter.outline.trim()}`, priority: 6 })
  if (book.worldview.goldenFinger.trim()) {
    blocks.push({ text: `【主角金手指】\n${book.worldview.goldenFinger.trim()}`, priority: 4 })
  }
  blocks.push({
    text: `【本章已有正文(节选)】\n《${chapter.title}》\n……${tail(textBefore, 4000)}`,
    priority: 9
  })
  const intentText = book.characters
    .slice(0, 10)
    .map((c) => c.name + (c.role ? `(${c.role})` : ''))
    .filter(Boolean)
    .join('、')
  if (intentText) blocks.push({ text: `【本书人物(保持人设一致)】\n${intentText}`, priority: 3 })
  blocks.push({
    text: '请从上文结尾处自然衔接,继续写约1000-1500字。保持文风、人称与情节连贯,直接输出续写内容,不要重复已有内容。',
    priority: 10
  })
  const user = assembleBlocks(blocks, ai.contextBudgetChars)
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

/** 润色选中片段 */
export function buildPolishMessages(book: Book, selection: string, ai: AISettings): ChatMessage[] {
  const system = stylePromptOf(book) + '\n\n本次任务为文字润色:保持情节、人物与前后文完全一致,只提升文字表现力。'
  const user = `请润色以下小说片段,直接输出润色后的正文,不要任何解释:\n\n${tail(selection, ai.contextBudgetChars)}`
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

/** 生成本章细纲 */
export function buildOutlineMessages(book: Book, chapter: Chapter, prevChapters: Chapter[], intent: string, ai: AISettings): ChatMessage[] {
  const system =
    stylePromptOf(book) +
    '\n\n本次任务为剧情设计:输出简洁的情节细纲,不要输出正文。'
  const blocks: Block[] = []
  blocks.push({
    text: `【作品】《${book.title}》(${book.genre})\n【全书简介】\n${book.description || '(暂无)'}`,
    priority: 3
  })
  const volume = book.volumes.find((v) => v.id === chapter.volumeId)
  if (volume?.summary.trim()) blocks.push({ text: `【本卷规划:${volume.title}】\n${volume.summary.trim()}`, priority: 5 })
  const last = prevChapters[prevChapters.length - 1]
  if (last?.summary.trim()) blocks.push({ text: `【上一章摘要】\n${last.summary.trim()}`, priority: 6 })
  const chars = book.characters
    .filter((c) => c.name.trim())
    .map((c) => `${c.name}${c.role ? '(' + c.role + ')' : ''}${c.personality.trim() ? ':' + c.personality.trim() : ''}`)
  if (chars.length > 0) blocks.push({ text: `【人物】\n- ${chars.join('\n- ')}`, priority: 4 })
  if (chapter.summary.trim()) blocks.push({ text: `【本章已有前情(自身摘要)】\n${chapter.summary.trim()}`, priority: 2 })
  blocks.push({
    text: `请为本章《${chapter.title}》写一份150字以内的情节细纲,分点列出:核心冲突、爽点设计、结尾钩子。${intent.trim() ? `\n【作者意图】${intent.trim()}` : ''}`,
    priority: 10
  })
  const user = assembleBlocks(blocks, ai.contextBudgetChars)
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

/** 生成前情摘要 */
export function buildSummaryMessages(book: Book, chapter: Chapter, ai: AISettings): ChatMessage[] {
  const system =
    stylePromptOf(book) +
    '\n\n本次任务为摘要提炼:用第三人称客观概括,不要评论,不要输出正文。'
  const user = `请把下面这一章内容浓缩为100-200字的前情摘要,涵盖:关键事件、人物关系变化、获得的收益/实力提升、埋下的伏笔。直接输出摘要。\n\n【章节】《${chapter.title}》\n【正文】\n${tail(chapter.content, ai.contextBudgetChars)}`
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

/** 为角色起名:返回候选名列表(每行一个) */
export function buildNamingMessages(book: Book, hint: string): ChatMessage[] {
  const system = '你是资深中文网络小说起名专家,精通玄幻、仙侠、都市、科幻等各类题材的人物命名,名字兼顾寓意、声调与辨识度。'
  const blocks: Block[] = []
  blocks.push({
    text: `【作品】《${book.title}》(${book.genre})\n【简介】${book.description || '(暂无)'}`,
    priority: 3
  })
  if (book.worldview.setting.trim()) blocks.push({ text: `【世界背景】${tail(book.worldview.setting, 600)}`, priority: 2 })
  if (book.characters.some((c) => c.name.trim())) {
    blocks.push({
      text: `【已有人物(避免重名)】${book.characters.map((c) => c.name).filter(Boolean).join('、')}`,
      priority: 4
    })
  }
  blocks.push({
    text: `请为「${hint.trim() || '主角'}」起 5 个中文名字,每行一个,只输出名字本身,不要编号、不要解释。`,
    priority: 10
  })
  const user = assembleBlocks(blocks, 6000)
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

/** 生成物品卡:输出 JSON 对象 */
export function buildItemMessages(book: Book, category: string, hint: string, ai: AISettings): ChatMessage[] {
  const system =
    stylePromptOf(book) +
    '\n\n本次任务为物品设定设计。只输出一个 JSON 对象,不要 markdown 代码块,不要任何解释。字段:name(名称)、grade(品级)、appearance(外观,50字内)、effect(能力/效果,100字内)、origin(获取方式,如炼制/掉落/传承/购买)、location(获取地点)、notes(备注,可为空字符串)。'
  const blocks: Block[] = []
  blocks.push({
    text: `【作品】《${book.title}》(${book.genre})\n【简介】${book.description || '(暂无)'}`,
    priority: 3
  })
  if (book.worldview.powerSystem.trim()) blocks.push({ text: `【等级体系】${tail(book.worldview.powerSystem, 600)}`, priority: 4 })
  if ((book.items ?? []).some((it) => it.name.trim())) {
    blocks.push({ text: `【已有物品(避免重名)】${book.items.map((it) => it.name).filter(Boolean).join('、')}`, priority: 3 })
  }
  blocks.push({
    text: `请设计一件${category.trim() || '物品'}。设计要求:${hint.trim() || '符合本书世界观,有辨识度,名字好听'}。品级需与本书等级体系匹配。`,
    priority: 10
  })
  const user = assembleBlocks(blocks, ai.contextBudgetChars)
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

/** 从章节正文提取阶段性物品:输出 JSON 数组 */
export function buildItemExtractMessages(book: Book, chapter: Chapter, ai: AISettings): ChatMessage[] {
  const system =
    stylePromptOf(book) +
    '\n\n本次任务为信息提取。只输出一个 JSON 数组,不要 markdown 代码块,不要任何解释。'
  const chapterIndex = book.chapters.findIndex((m) => m.id === chapter.id) + 1
  const user = `请从下面这一章正文中,提取出现过的有剧情意义的物品、材料、武器、丹药、阵法、功法、科技或魔法造物(无关紧要的日常物品不要)。每件物品输出一个 JSON 对象,字段:name(名称,保留原文)、category(类别:武器/丹药/阵法/功法/材料/科技造物/魔法物品/其他)、grade(品级,正文未提则为空字符串)、effect(能力/效果,正文未提则为空字符串)、origin(获取方式,如炼制/掉落/购买/赠予,未提则为空字符串)、location(获取地点,未提则为空字符串)、owner(当前持有者,未提则为空字符串)。本章没有新物品则输出 []。\n\n【章节】第${chapterIndex}章《${chapter.title}》\n【正文】\n${tail(chapter.content, ai.contextBudgetChars)}`
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

/** 扫书:从任意小说文本片段中提取世界观/境界/物品功法/人物(输出 JSON) */
export function buildScanMessages(chunk: string): ChatMessage[] {
  const system =
    '你是网文设定分析师,擅长从小说文本中提炼世界观、境界/等级体系、功法、物品材料与人物设定。只输出一个 JSON 对象,不要 markdown 代码块,不要任何解释。'
  const user = `请从下面这段小说文本中提取设定信息,输出一个 JSON 对象,字段要求:
- "worldview": 字符串,本段体现的世界观设定要点(世界背景、规则、地理、势力、历史等),一段话 120 字以内;没有则为空字符串
- "realms": 字符串数组,文中出现的境界/等级/实力划分名称(如 ["炼气","筑基","金丹"]),按出现顺序去重;没有则为空数组
- "items": 对象数组,文中出现的重要功法、武器、丹药、阵法、材料等,每项 {"name":"名称","category":"类别","grade":"品级","effect":"效果","origin":"获取方式","location":"获取地点"},category 只能取:武器/丹药/阵法/功法/材料/其他;未提及的字段填空字符串;没有则为空数组
- "characters": 对象数组,出场人物 {"name":"姓名","role":"身份简述(如 主角/反派/师父)"},只要有人物名就提取;没有则为空数组

【文本片段】
${chunk}`
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}
