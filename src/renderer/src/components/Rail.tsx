import {
  BookOpen,
  Command,
  Download,
  Map as MapIcon,
  Moon,
  PenLine,
  ScanSearch,
  Settings,
  Sun,
  Vault
} from 'lucide-react'
import { totalWords, useStore } from '../store'
import type { WorkspaceMode } from '../store'

/** 工作区模式导航(需先打开一本书) */
const MODES: { id: WorkspaceMode; label: string; icon: typeof PenLine; kbd: string }[] = [
  { id: 'write', label: '写作', icon: PenLine, kbd: 'Ctrl+1' },
  { id: 'codex', label: '设定中心', icon: Vault, kbd: 'Ctrl+2' },
  { id: 'outline', label: '大纲规划', icon: MapIcon, kbd: 'Ctrl+3' },
  { id: 'import', label: '拆书扫书', icon: ScanSearch, kbd: 'Ctrl+4' }
]

/**
 * 左侧竖向导航栏:印章 Logo + 书库 + 四大工作区 + 底部工具。
 * 沉浸写作模式下由 App 隐藏。
 */
export default function Rail() {
  const view = useStore((s) => s.view)
  const book = useStore((s) => s.book)
  const workspaceMode = useStore((s) => s.workspaceMode)
  const setWorkspaceMode = useStore((s) => s.setWorkspaceMode)
  const backToLibrary = useStore((s) => s.backToLibrary)
  const setPaletteOpen = useStore((s) => s.setPaletteOpen)
  const theme = useStore((s) => s.settings.theme)
  const updateSettings = useStore((s) => s.updateSettings)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const exportTxt = useStore((s) => s.exportTxt)

  const inLibrary = view === 'library'

  return (
    <nav className="rail">
      {/* 印章 Logo + 应用名(hover 展开时露出) */}
      <div className="flex shrink-0 items-center gap-2.5" style={{ margin: '0 8px 8px 11px' }}>
        <div className="seal !m-0" title={`AI 网文工作台${book ? ` · ${totalWords(book).toLocaleString('zh-CN')} 字` : ''}`}>
          著
        </div>
        <span className="rail-label serif text-xs font-bold tracking-wider">网文工作台</span>
      </div>

      <button
        className={`rail-btn labeled ${inLibrary ? 'active' : ''}`}
        title="书库"
        onClick={() => {
          if (!inLibrary) void backToLibrary()
        }}
      >
        <BookOpen size={17} />
        <span className="rail-label">书库</span>
      </button>

      <div className="mx-auto my-1 h-px w-6 shrink-0" style={{ background: 'var(--border-strong)' }} />

      {MODES.map(({ id, label, icon: Icon, kbd }) => (
        <button
          key={id}
          className={`rail-btn labeled ${!inLibrary && workspaceMode === id ? 'active' : ''}`}
          title={book ? `${label} (${kbd})` : `${label} · 先打开一本书`}
          disabled={!book}
          onClick={() => {
            if (book) setWorkspaceMode(id)
          }}
        >
          <Icon size={17} />
          <span className="rail-label">{label}</span>
        </button>
      ))}

      <div className="flex-1" />

      <button className="rail-btn labeled" title="命令面板 (Ctrl+K)" onClick={() => setPaletteOpen(true)}>
        <Command size={16} />
        <span className="rail-label">命令面板</span>
      </button>
      {book && (
        <button className="rail-btn labeled" title="导出全书 TXT" onClick={() => void exportTxt()}>
          <Download size={16} />
          <span className="rail-label">导出 TXT</span>
        </button>
      )}
      <button
        className="rail-btn labeled"
        title={theme === 'dark' ? '切到浅色(白日书房)' : '切到深色(夜间书房)'}
        onClick={() => void updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        <span className="rail-label">{theme === 'dark' ? '浅色模式' : '深色模式'}</span>
      </button>
      <button className="rail-btn labeled" title="设置" onClick={() => setSettingsOpen(true)}>
        <Settings size={16} />
        <span className="rail-label">设置</span>
      </button>
    </nav>
  )
}
