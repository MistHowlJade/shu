import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store'
import { useFocusTrap } from '../hooks/useFocusTrap'

export default function CreateBookModal() {
  const open = useStore((s) => s.createBookOpen)
  const setCreateBookOpen = useStore((s) => s.setCreateBookOpen)
  const createBook = useStore((s) => s.createBook)
  const showToast = useStore((s) => s.showToast)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [genre, setGenre] = useState('都市爽文')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  /* 焦点陷阱:Tab 不跑出弹窗,打开时光标直接落在书名输入框 */
  const cardRef = useRef<HTMLDivElement>(null)
  useFocusTrap(cardRef, open)

  if (!open) return null

  async function submit() {
    if (creating) return
    if (!title.trim()) {
      showToast('请填写书名', 'error')
      return
    }
    setCreating(true)
    try {
      await createBook({ title, author, genre, description })
      setCreateBookOpen(false)
      setTitle('')
      setAuthor('')
      setGenre('都市爽文')
      setDescription('')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => setCreateBookOpen(false)}>
      <div
        ref={cardRef}
        tabIndex={-1}
        className="modal-card w-full max-w-lg p-6 outline-none fade-up"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          /* 输入区回车直接创建(简介多行输入除外,那里回车是换行) */
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault()
            void submit()
          }
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="serif text-lg font-semibold tracking-wide">新建书籍</h2>
          <button className="btn-ghost !px-2" onClick={() => setCreateBookOpen(false)}>
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="field-label">书名 *</label>
            <input
              className="field-input"
              data-autofocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如:我以神通镇万界"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">作者</label>
              <input className="field-input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="笔名" />
            </div>
            <div>
              <label className="field-label">类型</label>
              <input className="field-input" list="genre-options" value={genre} onChange={(e) => setGenre(e.target.value)} />
              <datalist id="genre-options">
                <option value="都市爽文" />
                <option value="玄幻修仙" />
                <option value="系统流" />
                <option value="赘婿逆袭" />
                <option value="重生复仇" />
                <option value="无限流" />
                <option value="历史权谋" />
              </datalist>
            </div>
          </div>
          <div>
            <label className="field-label">简介(会作为 AI 了解全书的背景,建议写清楚金手指和主线)</label>
            <textarea
              className="field-input min-h-24 resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="一句话主线 + 主角金手指 + 终极目标。例如:落魄实习生偶得神级签到系统,在都市修行,一路打脸各路天骄,最终揭开家族覆灭真相。"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setCreateBookOpen(false)}>
            取消
          </button>
          <button className="btn-primary" disabled={creating} onClick={() => void submit()}>
            {creating ? '创建中…' : '创建并打开'}
          </button>
        </div>
      </div>
    </div>
  )
}
