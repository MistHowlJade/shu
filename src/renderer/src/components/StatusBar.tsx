import { Check, CloudUpload, Loader2 } from 'lucide-react'
import { activeProfile } from '@shared/types'
import { totalWords, useStore } from '../store'

export default function StatusBar() {
  const chapter = useStore((s) => s.chapter)
  const book = useStore((s) => s.book)
  const dirty = useStore((s) => s.dirty)
  const savedAt = useStore((s) => s.savedAt)
  const aiRunning = useStore((s) => s.aiRunning)
  const autoWrite = useStore((s) => s.autoWrite)
  const content = useStore((s) => s.content)
  const settings = useStore((s) => s.settings)
  const profile = activeProfile(settings.ai)

  const saveState = dirty ? (
    <span className="flex items-center gap-1" style={{ color: 'var(--warn)' }}>
      <CloudUpload size={12} /> 编辑中…
    </span>
  ) : savedAt ? (
    <span className="flex items-center gap-1 ok">
      <Check size={12} /> 已保存 {new Date(savedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
    </span>
  ) : null

  return (
    <div
      className="flex h-7 shrink-0 items-center gap-4 px-4 text-xs t3"
      style={{ borderTop: '1px solid var(--border)', background: 'var(--panel)' }}
    >
      {(aiRunning || autoWrite?.running) && (
        <span className="flex items-center gap-1.5 accent">
          <Loader2 size={12} className="animate-spin" />
          {autoWrite?.running ? `自动连写 ${autoWrite.done}/${autoWrite.total}` : 'AI 生成中'}
        </span>
      )}
      {saveState}
      {chapter && <span>本章 {content.replace(/\s/g, '').length.toLocaleString('zh-CN')} 字</span>}
      {book && <span>全书 {totalWords(book).toLocaleString('zh-CN')} 字 · {book.chapters.length} 章</span>}
      <span className="ml-auto flex items-center gap-1 truncate">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
        模型:{profile.name || profile.model || '未配置'}
      </span>
    </div>
  )
}
