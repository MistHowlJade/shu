import type { AiResult, ChapterMeta, GenerateKind } from '@shared/types'
import type { StoreState } from '../store'
import { uid, type AIRequest, type SliceCtx } from './types'

/** AI 生成切片:整章/续写/细纲/摘要/润色的流式生成、输出落地与自动连写 */
export interface AISlice {
  aiRunning: boolean
  aiRequest: AIRequest | null
  aiOutput: string
  aiError: string | null
  aiIntent: string
  aiLastKind: GenerateKind | null
  /** 自动连写状态;null 表示未在连写。confirmEach = 逐章确认细纲的人工闸口模式 */
  autoWrite: {
    running: boolean
    total: number
    done: number
    currentTitle: string
    stop: boolean
    confirmEach: boolean
    targets: ChapterMeta[]
    index: number
    pending: { outline: string } | null
  } | null

  setAiIntent: (text: string) => void
  runGenerate: (kind: GenerateKind) => Promise<void>
  stopGenerate: () => Promise<void>
  appendOutputToContent: () => Promise<void>
  insertOutputAtCursor: () => Promise<void>
  replaceChapterWithOutput: () => Promise<void>
  replaceSelectionWithOutput: () => Promise<void>
  applyOutputToOutline: (mode: 'set' | 'append') => Promise<void>
  copyOutput: () => Promise<void>
  clearAiOutput: () => void
  runAutoWrite: (count: number, confirmEach?: boolean) => Promise<void>
  /** 自动连写推进:写下一章 / 在确认模式下等待批准后继续 */
  stepAutoWrite: () => Promise<void>
  /** 人工闸口:批准当前细纲(可带作者修改稿),开始写这一章 */
  approveAutoWrite: (outline?: string) => Promise<void>
  /** 人工闸口:跳过当前章,继续下一章 */
  skipAutoWrite: () => Promise<void>
  /** @internal 自动连写:收尾(清状态 + 汇总提示) */
  finishAutoWrite: () => Promise<void>
  /** @internal 自动连写:生成正文 → 落盘 → 生成摘要 → 计数 */
  writeCurrentChapter: () => Promise<void>
  stopAutoWrite: () => Promise<void>
}

export function aiSlice({ set, get }: SliceCtx): AISlice {
  return {
    aiRunning: false,
    aiRequest: null,
    aiOutput: '',
    aiError: null,
    aiIntent: '',
    aiLastKind: null,
    autoWrite: null,

    setAiIntent: (text) => set({ aiIntent: text }),

    runGenerate: async (kind) => {
      const { aiRunning, bookDir, chapter, content, selection, aiIntent: intent } = get()
      if (aiRunning || !bookDir || !chapter) return
      /* 主进程按磁盘正文组装上下文(摘要/续写/扫描都读盘),先把未保存的编辑落盘 */
      if (get().dirty) await get().saveNow()
      const requestId = uid()
      set({ aiRunning: true, aiRequest: { id: requestId, kind }, aiOutput: '', aiError: null, aiLastKind: kind })
      /* 抽屉关着时自动弹出,让流式输出始终可见;沉浸模式不打断(悬浮进度条兜底) */
      if (!get().aiOpen && !get().focusMode) get().setAiOpen(true)

      /* 订阅流式增量 */
      const unsubscribe = window.api.ai.onDelta((payload) => {
        if (payload.requestId !== requestId) return
        set((s) => ({ aiOutput: s.aiOutput + payload.delta }))
      })

      const input = { requestId, dir: bookDir, chapterId: chapter.id, intent }
      let result: AiResult
      try {
        if (kind === 'chapter') result = await window.api.ai.generateChapter(input)
        else if (kind === 'continue') {
          /* 从光标位置续写;未定位到光标(或光标在开头)则从章末 */
          const cursor = selection ? Math.min(Math.max(0, selection.start), content.length) : content.length
          const raw = content.slice(0, cursor)
          const textBefore = raw.trim() ? raw : content
          if (!textBefore.trim()) {
            unsubscribe()
            set({ aiRunning: false, aiRequest: null, aiError: '本章还没有内容,请先写一段或用「生成整章」' })
            return
          }
          result = await window.api.ai.generateContinue({ requestId, dir: bookDir, chapterId: chapter.id, textBefore })
        }
        else if (kind === 'outline') result = await window.api.ai.generateOutline(input)
        else if (kind === 'consistency') result = await window.api.ai.generateConsistency({ requestId, dir: bookDir, chapterId: chapter.id })
        else if (kind === 'summary') result = await window.api.ai.summarize(input)
        else {
          const text = selection ? content.slice(selection.start, selection.end) : ''
          if (!text.trim()) {
            unsubscribe()
            set({ aiRunning: false, aiRequest: null, aiError: '请先在正文中选中要润色的文字' })
            return
          }
          result = await window.api.ai.polish({ requestId, dir: bookDir, chapterId: chapter.id, selection: text })
        }
      } catch (err) {
        unsubscribe()
        set({ aiRunning: false, aiRequest: null, aiError: err instanceof Error ? err.message : String(err) })
        return
      }
      unsubscribe()

      if (result.ok && kind === 'summary' && result.text) {
        const summary = result.text.trim()
        set((state) => ({
          chapter: state.chapter ? { ...state.chapter, summary } : state.chapter,
          aiOutput: summary
        }))
      }
      set({
        /* 失败或中断时保留已流式输出的部分内容 */
        aiOutput: result.ok && kind !== 'summary' ? (result.text ?? '') : get().aiOutput,
        /* 手动停止是正常操作,不弹红色错误 */
        aiError: result.ok || result.error === '已停止生成' ? null : (result.error ?? '生成失败')
      })
      if (kind === 'summary' && result.ok) {
        get().showToast('前情摘要已写入本章')
        /* 摘要即「本章写完」的信号,顺带检出本章新设定;期间保持忙碌态,避免用户再触发一次 AI 请求 */
        await get().autoDetectChapter()
      }
      if (!result.ok && result.error !== '已停止生成') get().showToast(`生成失败:${result.error}`, 'error')
      set({
        aiRunning: false,
        aiRequest: get().aiRequest?.id === requestId ? null : get().aiRequest
      })
    },

    stopGenerate: async () => {
      const { aiRequest } = get()
      if (aiRequest) await window.api.ai.abort(aiRequest.id)
    },

    appendOutputToContent: async () => {
      const { aiOutput, content } = get()
      if (!aiOutput.trim()) return
      const joiner = content.trim() ? '\n\n' : ''
      get().setContent(content.replace(/\s*$/, '') + joiner + aiOutput.trim())
      get().showToast('已追加到正文末尾')
    },

    insertOutputAtCursor: async () => {
      const { aiOutput, content, selection } = get()
      if (!aiOutput.trim()) return
      const cursor = selection ? Math.min(Math.max(0, selection.start), content.length) : content.length
      const insert = aiOutput.trim()
      get().setContent(content.slice(0, cursor) + insert + content.slice(cursor))
      set({ pendingCaret: cursor + insert.length, selection: { start: cursor + insert.length, end: cursor + insert.length } })
      get().showToast('已插入到光标处')
    },

    replaceChapterWithOutput: async () => {
      const { aiOutput } = get()
      if (!aiOutput.trim()) return
      get().setContent(aiOutput.trim())
      get().showToast('已替换本章正文')
    },

    replaceSelectionWithOutput: async () => {
      const { aiOutput, content, selection } = get()
      if (!aiOutput.trim() || !selection) return
      const next = content.slice(0, selection.start) + aiOutput.trim() + content.slice(selection.end)
      get().setContent(next)
      set({ selection: null })
      get().showToast('已替换选中内容')
    },

    applyOutputToOutline: async (mode) => {
      const { aiOutput, chapter } = get()
      if (!aiOutput.trim() || !chapter) return
      const next = mode === 'set' ? aiOutput.trim() : (chapter.outline.trim() ? chapter.outline.trim() + '\n' : '') + aiOutput.trim()
      get().setOutline(next)
      const { bookDir } = get()
      if (bookDir) {
        await window.api.chapters.save(bookDir, { ...get().chapter!, content: get().content })
        get().showToast('细纲已更新')
      }
    },

    copyOutput: async () => {
      const { aiOutput } = get()
      if (!aiOutput) return
      await navigator.clipboard.writeText(aiOutput)
      get().showToast('已复制到剪贴板')
    },

    clearAiOutput: () => set({ aiOutput: '', aiError: null, aiLastKind: null }),


    /* ---- 自动连写内部工具 ---- */
    finishAutoWrite: async () => {
      const aw = get().autoWrite
      const done = aw?.done ?? 0
      const stopped = aw?.stop ?? false
      set({ autoWrite: null })
      get().showToast(stopped ? `自动连写已停止,完成 ${done} 章` : `自动连写完成,共 ${done} 章`)
    },

    writeCurrentChapter: async () => {
      await get().runGenerate('chapter')
      /* 失败(含手动停止、限流)即终止整轮连写 */
      if (get().aiError) {
        await get().finishAutoWrite()
        return
      }
      const output = get().aiOutput
      if (output.trim()) {
        get().setContent(output.trim())
        await get().saveNow()
      }
      /* 摘要供后续章节的记忆系统使用,失败不中断 */
      await get().runGenerate('summary')
      const aw = get().autoWrite
      if (aw) set({ autoWrite: { ...aw, done: aw.done + 1 } })
    },

    runAutoWrite: async (count, confirmEach = false) => {
      const { autoWrite, book, bookDir } = get()
      if (autoWrite?.running || !book || !bookDir) return
      /* 只写「待写」且正文为空的章节:状态被点回「待写」但已有正文的章一律跳过,绝不覆盖 */
      const targets = book.chapters
        .filter((m) => m.status === 'todo' && m.wordCount === 0)
        .slice(0, Math.max(1, count))
      if (targets.length === 0) {
        get().showToast(
          '没有可写的空章节:自动连写只写「待写」且字数为 0 的章,已有正文的章不会被覆盖',
          'error'
        )
        return
      }
      set({
        autoWrite: {
          running: true,
          total: targets.length,
          done: 0,
          currentTitle: targets[0].title,
          stop: false,
          confirmEach,
          targets,
          index: 0,
          pending: null
        }
      })
      if (!get().aiOpen && !get().focusMode) get().setAiOpen(true)
      await get().stepAutoWrite()
    },

    stepAutoWrite: async () => {
      let aw = get().autoWrite
      if (!aw?.running) return
      if (aw.stop || aw.index >= aw.targets.length) {
        await get().finishAutoWrite()
        return
      }
      const meta = aw.targets[aw.index]
      set({ autoWrite: { ...aw, currentTitle: meta.title } })
      await get().selectChapter(meta.id)
      aw = get().autoWrite
      if (!aw?.running || aw.stop) {
        await get().finishAutoWrite()
        return
      }
      /* 人工闸口:先生成细纲,等作者批准/跳过 */
      if (aw.confirmEach) {
        await get().runGenerate('outline')
        const outline = get().aiOutput
        const cur = get().autoWrite
        if (cur) set({ autoWrite: { ...cur, pending: { outline } } })
        return
      }
      await get().writeCurrentChapter()
      aw = get().autoWrite
      if (!aw) return
      set({ autoWrite: { ...aw, index: aw.index + 1 } })
      await get().stepAutoWrite()
    },

    approveAutoWrite: async (outline) => {
      const aw = get().autoWrite
      if (!aw?.pending) return
      /* 作者批准(可能改过)的细纲写进本章,再开始写正文 */
      get().setOutline(outline ?? aw.pending.outline)
      await get().saveNow()
      const cur = get().autoWrite
      if (cur) set({ autoWrite: { ...cur, pending: null } })
      await get().writeCurrentChapter()
      const next = get().autoWrite
      if (!next) return
      set({ autoWrite: { ...next, index: next.index + 1 } })
      await get().stepAutoWrite()
    },

    skipAutoWrite: async () => {
      const aw = get().autoWrite
      if (!aw?.pending) return
      set({ autoWrite: { ...aw, pending: null, index: aw.index + 1 } })
      await get().stepAutoWrite()
    },

    stopAutoWrite: async () => {
      const aw = get().autoWrite
      if (!aw) return
      set({ autoWrite: { ...aw, stop: true } })
      const request = get().aiRequest
      if (request) await window.api.ai.abort(request.id)
    }
  }
}
