import type { AiResult, ChatMessage } from '@shared/types'
import type { StoreState } from '../store'
import { emptyInspire, persistInspire, uid, type InspireMsg, type InspireState, type SliceCtx } from './types'

/** 灵感陪聊切片:卡文时与 AI 边聊边构思;对话按书持久化到 localStorage,重启后接着聊 */
export interface InspireSlice {
  inspire: InspireState

  sendInspire: (text: string) => Promise<void>
  stopInspire: () => Promise<void>
  clearInspire: () => void
  insertInspire: (text: string) => void
}

export function inspireSlice({ set, get }: SliceCtx): InspireSlice {
  return {
    inspire: emptyInspire(),

    sendInspire: async (text) => {
      const trimmed = text.trim()
      const { inspire, book, chapter, aiRunning, bookDir: dir } = get()
      if (!trimmed || inspire.busy || aiRunning) return

      const userMsg: InspireMsg = { id: uid(), role: 'user', content: trimmed }
      const history = [...inspire.msgs, userMsg]
      const requestId = uid()
      set({
        inspire: { msgs: history, busy: true, stream: '', error: null, requestId }
      })
      /* 问题先落盘,生成途中关窗口也不丢 */
      persistInspire(dir, history)

      /* 流式增量:acc 是已收文本的真相来源;期间若切了书,只记录不污染新书对话 */
      let acc = ''
      const unsubscribe = window.api.ai.onDelta((payload) => {
        if (payload.requestId !== requestId) return
        acc += payload.delta
        if (get().bookDir !== dir) return
        set((s) => ({ inspire: { ...s.inspire, stream: acc } }))
      })

      /* 系统提示:写作灵感伙伴 + 当前书/章上下文,让建议贴着剧情走 */
      const ctxParts: string[] = []
      if (book) ctxParts.push(`当前小说《${book.title}》(${book.genre})`)
      if (chapter) {
        ctxParts.push(`正在写第${(book?.chapters.findIndex((c) => c.id === chapter.id) ?? 0) + 1}章「${chapter.title}」`)
        if (chapter.outline?.trim()) ctxParts.push(`本章细纲:${chapter.outline.trim().slice(0, 400)}`)
      }
      const system: ChatMessage = {
        role: 'system',
        content:
          '你是网文作者的「灵感陪聊」搭档。作者写作卡住时会一边和你聊一边自己思考,目标是帮他把下一段怎么写想清楚。\n' +
          '规则:\n' +
          '1. 中文口语化回复,像懂行的责编朋友聊天,不要摆架子、不要客套。\n' +
          '2. 一次给 2~3 个具体可写的方向(冲突、爽点、反转、情绪、对话……),每个方向用一两句示范怎么落到纸上。\n' +
          '3. 适当用反问抛问题,引导作者自己做选择;作者已给出的想法要顺着深入,不要推翻。\n' +
          '4. 除非作者要求展开,正文控制在 250 字以内。\n' +
          '5. 与作者已确定的设定、细纲保持一致,不要自相矛盾。\n' +
          (ctxParts.length ? `背景:${ctxParts.join(';')}。` : '')
      }
      const messages: ChatMessage[] = [
        system,
        ...history.map((m) => ({ role: m.role, content: m.content }))
      ]

      let result: AiResult
      try {
        result = await window.api.ai.generate(requestId, messages)
      } catch (e) {
        unsubscribe()
        if (get().bookDir === dir) {
          set({
            inspire: { ...get().inspire, busy: false, stream: '', requestId: null, error: String(e) }
          })
        }
        return
      }
      unsubscribe()

      /* 定稿:成功或手动停止都保留(部分)回复;手动停止是正常操作,不算错误 */
      const stopped = !result.ok && result.error === '已停止生成'
      const finalText = (result.ok ? result.text : '') || acc
      const nextMsgs: InspireMsg[] = finalText
        ? [...history, { id: uid(), role: 'assistant', content: finalText }]
        : history
      persistInspire(dir, nextMsgs)
      if (get().bookDir !== dir) return /* 用户已切走:不动新书的界面状态 */
      set({
        inspire: {
          msgs: nextMsgs,
          busy: false,
          stream: '',
          requestId: null,
          error: result.ok || stopped ? null : result.error || '生成失败'
        }
      })
    },

    stopInspire: async () => {
      const req = get().inspire.requestId
      if (req) {
        await window.api.ai.abort(req)
        /* abort 后 sendInspire 的收尾逻辑负责落对话/恢复 busy */
      }
    },

    clearInspire: () => {
      persistInspire(get().bookDir, [])
      set({ inspire: emptyInspire() })
    },

    insertInspire: (text) => {
      const { content, selection } = get()
      if (!text) return
      const at = selection ? Math.min(Math.max(0, selection.start), content.length) : content.length
      const next = content.slice(0, at) + text + content.slice(at)
      set({ content: next, dirty: true, pendingCaret: at + text.length })
    }
  }
}
