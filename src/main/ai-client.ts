import type { ChatMessage } from '../shared/types'

const controllers = new Map<string, AbortController>()

/** 一次调用所需的连接信息,来自当前激活的模型配置 */
export interface ChatEndpoint {
  baseUrl: string
  apiKey: string
  model: string
  /** 本配置的单次生成上限(可选) */
  maxTokens?: number
}

export function abortGeneration(requestId: string): void {
  controllers.get(requestId)?.abort()
  controllers.delete(requestId)
}

function chatUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '') + '/chat/completions'
}

function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`
  return headers
}

interface ChatOptions {
  requestId: string
  endpoint: ChatEndpoint
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
  onDelta?: (text: string) => void
}

interface ChatChoice {
  delta?: { content?: string }
  message?: { content?: string }
}

interface ChatResponse {
  choices?: ChatChoice[]
  error?: { message?: string }
}

/** 非流式调用,用于连通性测试 */
export async function chatOnce(endpoint: ChatEndpoint, prompt: string, maxTokens = 16): Promise<{ text: string; ms: number }> {
  const start = Date.now()
  const res = await fetch(chatUrl(endpoint.baseUrl), {
    method: 'POST',
    headers: buildHeaders(endpoint.apiKey),
    body: JSON.stringify({
      model: endpoint.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.1,
      stream: false
    }),
    signal: AbortSignal.timeout(30000)
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as ChatResponse
  /* 部分网关用 HTTP 200 + error 字段报错(如上游过载),不能当成功 */
  if (data.error?.message) throw new Error(data.error.message)
  const text = data.choices?.[0]?.message?.content ?? ''
  return { text, ms: Date.now() - start }
}

/**
 * 流式对话:逐段回调 delta,返回完整文本。
 * 网络错误 / HTTP 错误 / 中断分别抛出带说明的异常。
 */
/** 流式读取空闲超时:超过该时长收不到任何数据则中止,避免请求挂死让 aiRunning 永远卡住 */
const IDLE_TIMEOUT_MS = 60_000

export async function streamChat(opts: ChatOptions): Promise<string> {
  const controller = new AbortController()
  controllers.set(opts.requestId, controller)

  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  const bumpIdle = (): void => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, IDLE_TIMEOUT_MS)
  }
  bumpIdle()

  try {
    const res = await fetch(chatUrl(opts.endpoint.baseUrl), {
      method: 'POST',
      headers: buildHeaders(opts.endpoint.apiKey),
      body: JSON.stringify({
        model: opts.endpoint.model,
        messages: opts.messages,
        stream: true,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens
      }),
      signal: controller.signal
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status} ${body.slice(0, 300)}`)
    }
    if (!res.body) throw new Error('响应没有内容流')

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let full = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bumpIdle() /* 收到数据,重置空闲计时 */
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') continue
        let json: ChatResponse | null = null
        try {
          json = JSON.parse(payload) as ChatResponse
        } catch {
          /* 忽略无法解析的行(如心跳注释) */
        }
        if (!json) continue
        /* 流中带 error 对象(上游过载/限流)时立即抛出,避免最后误报"没有返回内容" */
        if (json.error?.message) throw new Error(`模型返回错误:${json.error.message}`)
        const delta = json.choices?.[0]?.delta?.content ?? ''
        if (delta) {
          full += delta
          opts.onDelta?.(delta)
        }
      }
    }
    if (!full.trim() && opts.messages.length > 0) {
      throw new Error('模型没有返回内容,请检查模型名称是否正确')
    }
    return full
  } catch (err) {
    if (timedOut) {
      throw new Error(`模型响应超时:超过 ${IDLE_TIMEOUT_MS / 1000} 秒未收到任何内容,请稍后重试`)
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('ABORTED')
    }
    throw err
  } finally {
    if (idleTimer) clearTimeout(idleTimer)
    controllers.delete(opts.requestId)
  }
}
