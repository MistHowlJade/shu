import { useEffect, useRef } from 'react'
import { FileText, History } from 'lucide-react'
import { useStore } from '../store'
import type { ChapterStatus } from '@shared/types'

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

export default function Editor() {
  const book = useStore((s) => s.book)
  const chapter = useStore((s) => s.chapter)
  const content = useStore((s) => s.content)
  const dirty = useStore((s) => s.dirty)
  const setContent = useStore((s) => s.setContent)
  const setSelection = useStore((s) => s.setSelection)
  const saveNow = useStore((s) => s.saveNow)
  const renameChapter = useStore((s) => s.renameChapter)
  const cycleChapterStatus = useStore((s) => s.cycleChapterStatus)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /* 自动保存:停止输入 900ms 后写盘 */
  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => {
      void saveNow()
    }, 900)
    return () => clearTimeout(timer)
  }, [content, dirty, saveNow])

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
      <div className="flex flex-1 flex-col items-center justify-center gap-2" style={{ background: 'var(--editor)' }}>
        {/* 空状态:仅两行文字,主提示 + 浅灰辅助,无图形装饰 */}
        <p className="text-sm font-medium t2">选择或新建一个章节,开始写稿</p>
        <p className="text-xs t3">左侧目录选章 · 右侧「AI 助手」可生成初稿</p>
      </div>
    )
  }

  const meta = book.chapters.find((c) => c.id === chapter.id)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" style={{ background: 'var(--editor)' }}>
      <div
        className="flex shrink-0 items-center py-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="measure flex w-full items-center gap-3 px-1">
          <input
            className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none"
            style={{ color: 'var(--text)' }}
            value={chapter.title}
            onChange={(e) => renameChapter(e.target.value)}
            placeholder="章节标题"
          />
          {meta && (
            <button
              className="btn-outline shrink-0 !py-1 !text-xs"
              title="点击切换状态:待写 → 草稿 → 完成"
              onClick={() => void cycleChapterStatus(meta.id)}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[meta.status] }} />
              {STATUS_LABEL[meta.status]}
            </button>
          )}
          <button
            className="btn-ghost shrink-0 !px-2"
            title="历史版本:每次保存覆盖正文前,旧版本自动归档(保留最近 10 份)"
            onClick={() => useStore.getState().setHistoryOpen(true)}
          >
            <History size={16} />
          </button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        className="measure min-h-0 w-full flex-1 resize-none bg-transparent px-1 py-6 text-[15px] leading-[1.9] outline-none"
        style={{ color: 'var(--t2)', caretColor: 'var(--accent)' }}
        value={content}
        placeholder={'在这里写作,或用右侧「AI 助手」生成初稿。\n\n· 光标停在任意位置,点「从光标续写」接着写\n· 写完一章点「前情摘要」,长篇不断片'}
        onChange={(e) => setContent(e.target.value)}
        onSelect={(e) => {
          const el = e.currentTarget
          setSelection({ start: el.selectionStart, end: el.selectionEnd })
        }}
        spellCheck={false}
      />
    </div>
  )
}
