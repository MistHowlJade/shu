import { useEffect, useRef, useState } from 'react'
import { History, Loader2 } from 'lucide-react'
import type { CSSProperties } from 'react'
import { activeProfile } from '@shared/types'
import { totalWords, useStore } from '../store'
import type { ChapterStatus } from '@shared/types'

/* 沉浸模式下没有顶栏:标题行空白处承担拖动窗口的能力 */
const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as CSSProperties

const STATUS_LABEL: Record<ChapterStatus, string> = {
  todo: '待写',
  draft: '草稿',
  done: '完成'
}
const STATUS_COLOR: Record<ChapterStatus, string> = {
  todo: 'var(--faint)',
  draft: 'var(--warn)',
  done: 'var(--ok)'
}

/** 今日字数基线:按书记录当天首次打开时的总字数,今日 = 当前 - 基线(保存正文后跳增) */
function todayWords(bookId: string, current: number): number {
  const key = `ai-novel:daily:${bookId}`
  const day = new Date().toLocaleDateString('sv-CN')
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as { date: string; baseline: number } | null
    const baseline = raw && raw.date === day ? raw.baseline : current
    localStorage.setItem(key, JSON.stringify({ date: day, baseline }))
    return Math.max(0, current - baseline)
  } catch {
    return 0
  }
}

export default function Editor() {
  const book = useStore((s) => s.book)
  const chapter = useStore((s) => s.chapter)
  const content = useStore((s) => s.content)
  const dirty = useStore((s) => s.dirty)
  const savedAt = useStore((s) => s.savedAt)
  const aiRunning = useStore((s) => s.aiRunning)
  const autoWrite = useStore((s) => s.autoWrite)
  const setContent = useStore((s) => s.setContent)
  const setSelection = useStore((s) => s.setSelection)
  const saveNow = useStore((s) => s.saveNow)
  const renameChapter = useStore((s) => s.renameChapter)
  const cycleChapterStatus = useStore((s) => s.cycleChapterStatus)
  const updateBook = useStore((s) => s.updateBook)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [today, setToday] = useState(0)
  const [targetEditing, setTargetEditing] = useState(false)
  const profileName = useStore((s) => activeProfile(s.settings.ai).name)

  /* 自动保存:停止输入 900ms 后写盘 */
  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => {
      void saveNow()
    }, 900)
    return () => clearTimeout(timer)
  }, [content, dirty, saveNow])

  /* book 在每次保存后都会换成新对象,正好在这里重算今日增量 */
  useEffect(() => {
    if (!book) {
      setToday(0)
      return
    }
    setToday(todayWords(book.id, totalWords(book)))
  }, [book])

  /* AI 插入内容后,把光标恢复到插入末尾,方便接着写 */
  const pendingCaret = useStore((s) => s.pendingCaret)
  useEffect(() => {
    if (pendingCaret == null) return
    const el = textareaRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(pendingCaret, pendingCaret)
      setSelection({ start: pendingCaret, end: pendingCaret })
    }
    useStore.setState({ pendingCaret: null })
  }, [pendingCaret, setSelection])

  if (!book || !chapter) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <p className="serif text-[15px] font-medium t2">选择或新建一个章节,开始写稿</p>
        <p className="text-xs t3">左侧目录选章 · AI 助手(Ctrl+I)可生成初稿</p>
      </div>
    )
  }

  const meta = book.chapters.find((c) => c.id === chapter.id)
  const reached = !!meta?.targetWords && content.replace(/\s/g, '').length >= meta.targetWords
  const chapterId = chapter.id

  function commitTarget(words: number): void {
    void updateBook((draft) => {
      const m = draft.chapters.find((c) => c.id === chapterId)
      if (!m) return
      if (words > 0) m.targetWords = words
      else delete m.targetWords
    })
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* 章节标题行:标题 + 状态切换 + 历史版本(行内空白处可拖动窗口) */}
      <div
        className="flex shrink-0 items-center py-4"
        style={{ WebkitAppRegion: 'drag', borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)' } as CSSProperties}
      >
        <div className="measure flex w-full items-center gap-3 px-2">
          <input
            className="serif min-w-0 flex-1 bg-transparent text-[20px] font-semibold tracking-wide outline-none"
            style={{ color: 'var(--text)', WebkitAppRegion: 'no-drag' } as CSSProperties}
            value={chapter.title}
            onChange={(e) => renameChapter(e.target.value)}
            placeholder="章节标题"
          />
          {meta && (
            <button
              className="btn-outline shrink-0 !rounded-full !py-1 !text-xs"
              style={NO_DRAG}
              title="点击切换状态:待写 → 草稿 → 完成"
              onClick={() => void cycleChapterStatus(meta.id)}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[meta.status] }} />
              {STATUS_LABEL[meta.status]}
            </button>
          )}
          <button
            className="btn-ghost shrink-0 !px-2"
            style={NO_DRAG}
            title="历史版本:每次保存覆盖正文前,旧版本自动归档(保留最近 10 份)"
            onClick={() => useStore.getState().setHistoryOpen(true)}
          >
            <History size={16} />
          </button>
        </div>
      </div>

      {/* 正文:手稿用思源宋体,17px / 2.1 行距,长文写作的主画布 */}
      <textarea
        ref={textareaRef}
        className="serif measure min-h-0 w-full flex-1 resize-none bg-transparent px-2 py-8 text-[17px] leading-[2.1] outline-none"
        style={{ color: 'var(--text)', caretColor: 'var(--accent)' }}
        value={content}
        placeholder={'在这里写作,或用 AI 助手(Ctrl+I)生成初稿。\n\n· 光标停在任意位置,点「从光标续写」接着写\n· 写完一章点「前情摘要」,长篇不断片'}
        onChange={(e) => setContent(e.target.value)}
        onSelect={(e) => {
          const el = e.currentTarget
          setSelection({ start: el.selectionStart, end: el.selectionEnd })
        }}
        spellCheck={false}
      />

      {/* 纸面内静默统计条(取代原状态栏):生成/保存/字数/目标,沉浸模式下也保留 */}
      <div
        className="flex h-9 shrink-0 items-center justify-center gap-4 px-4 text-[11.5px] t3"
        style={{ borderTop: '1px solid color-mix(in srgb, var(--border) 60%, transparent)' }}
      >
        {(aiRunning || autoWrite?.running) && (
          <span className="flex items-center gap-1.5 accent">
            <Loader2 size={12} className="animate-spin" />
            {autoWrite?.running ? `自动连写 ${autoWrite.done}/${autoWrite.total}` : 'AI 生成中'}
          </span>
        )}
        {dirty ? (
          <span style={{ color: 'var(--warn)' }}>编辑中…</span>
        ) : savedAt ? (
          <span className="ok">已保存 {new Date(savedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
        ) : null}
        {/* 本章字数 / 目标字数:点数字可编辑目标,达成点亮 */}
        {targetEditing ? (
          <input
            autoFocus
            type="number"
            min={0}
            defaultValue={meta?.targetWords ?? ''}
            placeholder="目标字数"
            className="w-20 rounded-md px-1.5 py-0.5 text-center text-[11.5px] outline-none"
            style={{ background: 'var(--panel-2)', color: 'var(--text)' }}
            onBlur={(e) => {
              const v = parseInt(e.target.value, 10)
              commitTarget(Number.isFinite(v) && v > 0 ? v : 0)
              setTargetEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setTargetEditing(false)
            }}
          />
        ) : (
          <button
            className="t3 transition hover:text-[var(--text)]"
            title="点击设置本章目标字数"
            onClick={() => setTargetEditing(true)}
          >
            <span style={reached ? { color: 'var(--ok)' } : undefined}>
              本章 {content.replace(/\s/g, '').length.toLocaleString('zh-CN')}
              {meta?.targetWords ? ` / ${meta.targetWords.toLocaleString()}` : ''} 字
              {reached ? ' ✦' : ''}
            </span>
          </button>
        )}
        <span>
          全书 {totalWords(book).toLocaleString('zh-CN')} 字 · {book.chapters.length} 章
        </span>
        {today > 0 && (
          <span className="ok" title="今天保存落盘的新增字数">
            今日 +{today.toLocaleString('zh-CN')} 字
          </span>
        )}
        <span className="hidden items-center gap-1 xl:flex" title="当前使用的模型">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
          {profileName || '未配置模型'}
        </span>
      </div>
    </div>
  )
}
