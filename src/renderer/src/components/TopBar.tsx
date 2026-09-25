import { ArrowLeft, Command, Maximize2, Search, Settings, Sparkles, Sun, Moon, Loader2 } from 'lucide-react'
import type { CSSProperties } from 'react'
import { totalWords, useStore } from '../store'
import type { WorkspaceMode } from '../store'

/* Electron 里顶栏整条可拖动(隐藏式标题栏);交互元素逐个恢复可点 */
const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as CSSProperties
const IS_ELECTRON = /Electron/i.test(navigator.userAgent)
const IS_MAC = /Mac/i.test(navigator.userAgent)

const MODES: { id: WorkspaceMode; label: string; kbd: string }[] = [
  { id: 'write', label: '写作', kbd: 'Ctrl+1' },
  { id: 'codex', label: '设定', kbd: 'Ctrl+2' },
  { id: 'outline', label: '大纲', kbd: 'Ctrl+3' },
  { id: 'import', label: '拆书', kbd: 'Ctrl+4' }
]

/**
 * 全局顶栏:返回书库 + 书名 · 分段式模式切换 · AI 抽屉 / 命令面板 / 主题 / 设置。
 * 原 Rail 与 StatusBar 已并入这一条,沉浸模式下由 App 隐藏。
 */
export default function TopBar() {
  const book = useStore((s) => s.book)
  const workspaceMode = useStore((s) => s.workspaceMode)
  const setWorkspaceMode = useStore((s) => s.setWorkspaceMode)
  const backToLibrary = useStore((s) => s.backToLibrary)
  const setPaletteOpen = useStore((s) => s.setPaletteOpen)
  const setSearchOpen = useStore((s) => s.setSearchOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const aiOpen = useStore((s) => s.aiOpen)
  const setAiOpen = useStore((s) => s.setAiOpen)
  const aiRunning = useStore((s) => s.aiRunning)
  const theme = useStore((s) => s.settings.theme)
  const updateSettings = useStore((s) => s.updateSettings)

  if (!book) return null

  const doneCount = book.chapters.filter((c) => c.status === 'done').length

  return (
    <header
      className="relative z-10 flex h-12 shrink-0 items-center gap-2 px-3"
      style={{
        WebkitAppRegion: 'drag',
        background: 'var(--panel)',
        borderBottom: '1px solid color-mix(in srgb, var(--border) 55%, transparent)'
      } as CSSProperties}
    >
      {/* 左:返回书库 + 书名 + 进度(macOS 红绿灯让位) */}
      <button
        className="btn-ghost !h-8 !w-8 !px-0"
        style={{ ...NO_DRAG, marginLeft: IS_MAC ? 64 : 0 } as CSSProperties}
        title="返回书库"
        onClick={() => void backToLibrary()}
      >
        <ArrowLeft size={16} />
      </button>
      <h1 className="serif max-w-[12rem] min-w-0 truncate text-[15px] font-semibold tracking-wide" title={book.title}>
        {book.title}
      </h1>
      <span className="hidden shrink-0 text-xs t3 xl:inline">
        {doneCount}/{book.chapters.length} 章 · {totalWords(book).toLocaleString('zh-CN')} 字
      </span>

      {/* 中:分段式模式切换(居中,替代原 Rail + 顶栏双份导航) */}
      <nav className="seg absolute left-1/2 -translate-x-1/2" style={NO_DRAG}>
        {MODES.map(({ id, label, kbd }) => (
          <button
            key={id}
            className={`seg-item ${workspaceMode === id ? 'active' : ''}`}
            title={`${label} (${kbd})`}
            onClick={() => setWorkspaceMode(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* 右:沉浸写作(仅写作页)/ AI 抽屉 / 命令面板 / 主题 / 设置;Electron 下给系统按钮让位 */}
      <div
        className="ml-auto flex shrink-0 items-center gap-1"
        style={{ ...NO_DRAG, marginRight: IS_ELECTRON && !IS_MAC ? 132 : 0 } as CSSProperties}
      >
        {workspaceMode === 'write' && (
          <button
            className="btn-ghost !h-8 !w-8 !px-0"
            title="沉浸写作:隐藏所有面板,只留正文(Esc 退出)"
            onClick={() => useStore.getState().setFocusMode(true)}
          >
            <Maximize2 size={15} />
          </button>
        )}
        <button
          className={`btn-ghost !h-8 !w-8 !px-0 ${aiRunning ? 'accent' : ''}`}
          title={aiOpen ? '收起 AI 助手 (Ctrl+I)' : 'AI 助手 (Ctrl+I)'}
          onClick={() => setAiOpen(!aiOpen)}
        >
          {aiRunning ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        </button>
        <button className="btn-ghost !h-8 !w-8 !px-0" title="全书搜索 (Ctrl+Shift+F)" onClick={() => setSearchOpen(true)}>
          <Search size={15} />
        </button>
        <button className="btn-ghost !h-8 !px-2" title="命令面板 (Ctrl+K)" onClick={() => setPaletteOpen(true)}>
          <Command size={14} />
          <span className="kbd hidden sm:inline-flex">Ctrl K</span>
        </button>
        <button
          className="btn-ghost !h-8 !w-8 !px-0"
          title={theme === 'dark' ? '切到浅色' : '切到深色'}
          onClick={() => void updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button className="btn-ghost !h-8 !w-8 !px-0" title="设置" onClick={() => setSettingsOpen(true)}>
          <Settings size={15} />
        </button>
      </div>
    </header>
  )
}
