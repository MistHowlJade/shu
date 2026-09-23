import { useEffect, useRef, useState } from 'react'
import { History, X } from 'lucide-react'
import { useStore } from '../store'
import { useFocusTrap } from '../hooks/useFocusTrap'

/** 章节历史版本列表:每次保存覆盖正文前,旧版自动归档(每章保留最近 10 份) */
export default function HistoryModal() {
  const open = useStore((s) => s.historyOpen)
  const setOpen = useStore((s) => s.setHistoryOpen)
  const restoreHistory = useStore((s) => s.restoreHistory)
  const bookDir = useStore((s) => s.bookDir)
  const chapter = useStore((s) => s.chapter)
  const showToast = useStore((s) => s.showToast)
  const [entries, setEntries] = useState<{ file: string; time: number; title: string; wordCount: number }[]>([])

  const cardRef = useRef<HTMLDivElement>(null)
  useFocusTrap(cardRef, open)

  useEffect(() => {
    if (!open || !bookDir || !chapter) return
    void window.api.chapters.history(bookDir, chapter.id).then(setEntries)
  }, [open, bookDir, chapter])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div
        ref={cardRef}
        tabIndex={-1}
        className="modal-card w-full max-w-md p-6 outline-none fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="serif flex items-center gap-2 text-lg font-semibold tracking-wide">
            <History size={17} />
            章节历史版本
          </h2>
          <button className="btn-ghost !px-2" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm t3">本章还没有历史版本。每次保存覆盖正文前,旧版本会自动归档(保留最近 10 份)。</p>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-auto pr-1">
            {entries.map((e) => (
              <div
                key={e.file}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--panel-2)' }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate" title={e.title}>
                    {new Date(e.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} · {e.title}
                  </div>
                  <div className="text-xs t3">{e.wordCount.toLocaleString('zh-CN')} 字</div>
                </div>
                <button
                  className="btn-outline shrink-0 !py-1 !text-xs"
                  onClick={() => {
                    if (window.confirm('载入该历史版本到编辑器?当前版本已自动归档,不会丢失。')) {
                      void restoreHistory(e.file)
                    }
                  }}
                >
                  载入
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs t3">载入后不会立即覆盖磁盘,保存(自动保存 / Ctrl+S)后才生效。</p>
      </div>
    </div>
  )
}
