/** 共享数据模型:主进程 / 预加载 / 渲染进程共用 */

export interface Volume {
  id: string
  title: string
  summary: string
}

export type ChapterStatus = 'todo' | 'draft' | 'done'

export interface ChapterMeta {
  id: string
  volumeId: string
  /** chapters/ 目录下的文件名 */
  file: string
  title: string
  status: ChapterStatus
  wordCount: number
  hasSummary: boolean
  updatedAt: number
}

export interface Character {
  id: string
  name: string
  role: string
  personality: string
  background: string
  arc: string
  notes: string
}

export interface Worldview {
  /** 世界背景设定 */
  setting: string
  /** 力量/等级体系 */
  powerSystem: string
  /** 金手指/主角外挂 */
  goldenFinger: string
  /** 势力与阵营 */
  factions: string
  notes: string
}

/** 物品/材料卡:武器、丹药、阵法、功法、科技造物、魔法物品等 */
export interface ItemEntry {
  id: string
  name: string
  /** 类别:武器/丹药/阵法/功法/材料/科技造物/魔法物品/其他(自由填写) */
  category: string
  /** 品级:如 圣器·下品 / 三阶 / 凡铁 */
  grade: string
  /** 外观描述 */
  appearance: string
  /** 能力/效果 */
  effect: string
  /** 获取方式:炼制/掉落/购买/传承/奖励…… */
  origin: string
  /** 获取地点 */
  location: string
  /** 当前持有者(角色名) */
  owner: string
  /** 阶段记录:在哪一卷/哪一章/哪个剧情阶段出现 */
  stage: string
  notes: string
}

/** 物品类别建议(datalist,可自由输入) */
export const ITEM_CATEGORIES = ['武器', '丹药', '阵法', '功法', '材料', '灵宠', '科技造物', '魔法物品', '坐骑', '其他']

export interface Book {
  id: string
  title: string
  author: string
  genre: string
  description: string
  /** 风格指令(system prompt,可编辑) */
  style: string
  volumes: Volume[]
  chapters: ChapterMeta[]
  characters: Character[]
  worldview: Worldview
  /** 物品/材料图鉴 */
  items: ItemEntry[]
  createdAt: number
  updatedAt: number
}

export interface Chapter {
  id: string
  volumeId: string
  title: string
  /** 本章细纲 */
  outline: string
  content: string
  /** 前情摘要(每章一段,供后续章节生成时注入上下文) */
  summary: string
  createdAt: number
  updatedAt: number
}

/** 一个可用的模型配置:接入任意 OpenAI 兼容服务,可自建任意多个 */
export interface AIProfile {
  id: string
  /** 显示名称,如「DeepSeek 官方」「我的中转站」「本地 Qwen」 */
  name: string
  baseUrl: string
  apiKey: string
  model: string
  /** 本配置的单次生成 token 上限;不填则用全局 maxTokens(推理模型建议调大) */
  maxTokens?: number
}

export interface AISettings {
  /** 模型配置列表,完全自定义,点谁用谁 */
  profiles: AIProfile[]
  /** 当前使用的配置 id */
  activeProfileId: string
  temperature: number
  maxTokens: number
  /** 组装上下文的字符预算 */
  contextBudgetChars: number
}

export type Theme = 'light' | 'dark'

export interface AppSettings {
  ai: AISettings
  libraryRoot: string
  lastBookPath: string | null
  theme: Theme
  /** 生成前情摘要时,自动检测本章新设定(人物/物品/境界/世界观)并入库 */
  autoScan: boolean
}

export interface BookSummary {
  dir: string
  book: Book
  /** book.json 存在但无法解析时为 true;book 为占位数据,禁止打开与覆盖写入 */
  broken?: boolean
}

/** ai:scanChapter 返回:新增设定的统计与明细,由渲染层合并进内存后统一写盘 */
export interface ScanChapterResult {
  ok: boolean
  error?: string
  newCharacters: number
  newItems: number
  newRealms: number
  worldAdded: boolean
  addedCharacters: Character[]
  addedItems: ItemEntry[]
  addedRealms: string[]
  addedWorldLines: string[]
}

export interface CreateBookInfo {
  title: string
  author: string
  genre: string
  description: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type GenerateKind = 'chapter' | 'continue' | 'polish' | 'outline' | 'summary'

export interface AiDelta {
  requestId: string
  delta: string
}

export interface AiResult {
  ok: boolean
  text?: string
  error?: string
}

/* ---------------- 默认值与预设 ---------------- */

export const DEFAULT_STYLE_PROMPT = `你是一位深耕网络小说多年的职业作者,擅长创作长篇中文爽文。写作要求:
1. 节奏明快,单章聚焦一个核心冲突或爽点,章末留钩子;
2. 多用短句和对话推动剧情,避免大段静态描写;
3. 情绪落差大:先压抑铺垫,再打脸/反转爆发,让读者"爽";
4. 严格保持人物性格、称谓、实力等级与既定设定一致;
5. 网文分段习惯:段落短小,两到五句一段,每段独立成行;
6. 只输出小说正文,不出现任何解释、标题或元叙述。`

export const EMPTY_WORLDVIEW: Worldview = {
  setting: '',
  powerSystem: '',
  goldenFinger: '',
  factions: '',
  notes: ''
}

export interface AIProviderPreset {
  id: string
  label: string
  baseUrl: string
  model: string
  keyHint: string
}

/** 快速填充模板;「自定义」为全空白起点 */
export const AI_PRESETS: AIProviderPreset[] = [
  {
    id: 'custom',
    label: '自定义',
    baseUrl: '',
    model: '',
    keyHint: '任意 OpenAI 兼容接口:官方 / 中转站 / one-api / 本地模型均可'
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    keyHint: '在 open.bigmodel.cn 控制台获取 API Key'
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keyHint: '在 platform.deepseek.com 获取 API Key'
  },
  {
    id: 'moonshot',
    label: 'Kimi (月之暗面)',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    keyHint: '在 platform.moonshot.cn 获取 API Key'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'inclusionai/ling-3.0-flash-sante:free',
    keyHint: '在 openrouter.ai/keys 获取;免费模型 ID 带 :free 后缀,每日有免费额度限制'
  },
  {
    id: 'ollama',
    label: 'Ollama (本地)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5:14b',
    keyHint: '本地模型无需 API Key'
  }
]

export const DEFAULT_AI_PROFILE: AIProfile = {
  id: 'default',
  name: '智谱 GLM',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: '',
  model: 'glm-4-flash'
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  profiles: [{ ...DEFAULT_AI_PROFILE }],
  activeProfileId: 'default',
  temperature: 0.8,
  maxTokens: 8192,
  contextBudgetChars: 12000
}

/** 取当前激活的模型配置;配置缺失时回退到第一个(或默认)配置 */
export function activeProfile(ai: AISettings): AIProfile {
  return ai.profiles.find((p) => p.id === ai.activeProfileId) ?? ai.profiles[0] ?? { ...DEFAULT_AI_PROFILE }
}

export const DEFAULT_SETTINGS: AppSettings = {
  ai: { ...DEFAULT_AI_SETTINGS, profiles: [{ ...DEFAULT_AI_PROFILE }] },
  libraryRoot: '',
  lastBookPath: null,
  theme: 'light',
  autoScan: true
}
