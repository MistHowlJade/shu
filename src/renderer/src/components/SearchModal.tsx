import { useEffect, useRef, useState } from 'react'
import { FileText, Loader2, Search } from 'lucide-react'
import { useStore } from '../store'
import { useFocusTrap } from '../hooks/useFocusTrap'

interface Hit {
  chapterId: string
  title: string
  where: string
  snippet: string
  count: number
}

/** 全书搜索浮层:搜标题/细纲/摘要/正文,点结果跳到对应章节 */
export default function SearchModal({ onClose }: { onClose: () => void }) {
  const showToast = useStore((s) => s.showToast)
  const selectChapter = useStore((s) => s.selectChapter)
  const setWorkspaceMode = useStore((s) => s.setWorkspaceMode)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useFocusTrap(cardRef, true)

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  /* 输入防抖 250ms 后在主进程搜索全书 */
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits(null)
      return
    }
    setBusy(true)
    const timer = setTimeout(async () => {
      try {
        const { bookDir } = useStore.getState()
        if (!bookDir) {
          setHits([])
          return
        }
        setHits(await window.api.books.searchBook(bookDir, q))
      } finally {
        setBusy(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  async function open(h: Hit): Promise<void> {
    await selectChapter(h.chapterId)
    setWorkspaceMode('write')
    onClose()
    showToast(`已跳转到「${h.title}」`)
  }

  return (
    <div className="modal-backdrop !z-50 !items-start !pt-[10vh]" onClick={onClose}>
      <div
        ref={cardRef}
        tabIndex={-1}
        className="modal-card fade-up flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <Search size={15} className="t3" />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="搜索全书:标题 / 细纲 / 摘要 / 正文……"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {busy && <Loader2 size={14} className="animate-spin t3" />}
          <span className="kbd">Esc 关闭</span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-2">
          {hits !== null && hits.length === 0 && query.trim() && (
            <p className="px-3 py-6 text-center text-sm t3">没有找到「{query.trim()}」</p>
          )}
          {hits !== null &&
            hits.map((h) => (
              <button
                key={h.chapterId}
                className="palette-item !items-start"
                onClick={() => void open(h)}
                title="跳转到该章节"
              >
                <FileText size={14} className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{h.title}</span>
                    <span className="kbd shrink-0">{h.where}</span>
                    <span className="shrink-0 text-[11px] t3">{h.count} 处</span>
                  </span>
                  {h.snippet && <span className="mt-0.5 block truncate text-xs t3">{h.snippet}</span>}
                </span>
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}
