import { Maximize2, Search } from 'lucide-react'
import { totalWords, useStore } from '../store'
import type { WorkspaceMode } from '../store'

const MODES: { id: WorkspaceMode; label: string }[] = [
  { id: 'write', label: '写作' },
  { id: 'codex', label: '设定中心' },
  { id: 'outline', label: '大纲规划' },
  { id: 'import', label: '拆书扫书' }
]

/**
 * 书籍上下文条:书名(宋体)+ 当前模式 + 沉浸模式/命令面板入口。
 * 沉浸写作模式下由 App 隐藏。
 */
export default function TopBar() {
  const book = useStore((s) => s.book)
  const workspaceMode = useStore((s) => s.workspaceMode)
  const setWorkspaceMode = useStore((s) => s.setWorkspaceMode)
  const setFocusMode = useStore((s) => s.setFocusMode)
  const setPaletteOpen = useStore((s) => s.setPaletteOpen)

  if (!book) return null

  const doneCount = book.chapters.filter((c) => c.status === 'done').length

  return (
    <header
      className="flex h-11 shrink-0 items-center gap-3 px-4"
      style={{ background: 'var(--panel)', borderBottom: '1px solid var(--border)' }}
    >
      <h1 className="serif min-w-0 truncate text-[15px] font-semibold" title={book.title}>
        《{book.title}》
      </h1>
      <span className="hidden shrink-0 text-xs t3 lg:inline">
        {book.genre} · 已完成 {doneCount}/{book.chapters.length} 章 · {totalWords(book).toLocaleString('zh-CN')} 字
      </span>

      {/* 页面标签:与左侧导航联动同步高亮 */}
      <div className="mx-auto flex shrink-0 items-center gap-0.5 rounded-full p-1" style={{ background: 'var(--panel-2)' }}>
        {MODES.map(({ id, label }) => {
          const active = workspaceMode === id
          return (
            <button
              key={id}
              className={`rounded-full px-3 py-1 text-xs transition ${
                active ? 'font-semibold' : 't3 hover:text-[var(--text)]'
              }`}
              style={active ? { background: 'var(--panel)', color: 'var(--accent)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : undefined}
              onClick={() => setWorkspaceMode(id)}
            >
              {label}
            </button>
          )
        })}
      </div>

      <button
        className="btn-ghost !px-2 !text-xs"
        title="命令面板 (Ctrl+K)"
        onClick={() => setPaletteOpen(true)}
      >
        <Search size={14} />
        <span className="kbd hidden sm:inline-flex">Ctrl+K</span>
      </button>
      {/* 沉浸写作只在写作页有意义,其他模式不放死按钮 */}
      {workspaceMode === 'write' && (
        <button
          className="btn-outline !px-2.5 !py-1 !text-xs"
          title="隐藏所有面板,只留正文(按 Esc 退出)"
          onClick={() => setFocusMode(true)}
        >
          <Maximize2 size={13} />
          沉浸写作
        </button>
      )}
    </header>
  )
}
