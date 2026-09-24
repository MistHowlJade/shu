import { useCallback, useEffect, useState } from 'react'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useStore } from './store'
import type { WorkspaceMode } from './store'
import LibraryView from './components/LibraryView'
import Rail from './components/Rail'
import TopBar from './components/TopBar'
import StatusBar from './components/StatusBar'
import WriteView from './components/WriteView'
import CodexView from './components/CodexView'
import OutlineView from './components/OutlineView'
import ImportView from './components/ImportView'
import AIPanel from './components/AIPanel'
import SettingsModal from './components/SettingsModal'
import CreateBookModal from './components/CreateBookModal'
import HistoryModal from './components/HistoryModal'
import CommandPalette from './components/CommandPalette'
import Toast from './components/Toast'

const MODE_KEYS: Record<string, WorkspaceMode> = {
  '1': 'write',
  '2': 'codex',
  '3': 'outline',
  '4': 'import'
}

/* AI 助手面板固定宽度(V2.0 布局规范:辅助面板定宽,视觉层级压低) */
const AI_PANEL_WIDTH = 340

export default function App() {
  const ready = useStore((s) => s.ready)
  const view = useStore((s) => s.view)
  const workspaceMode = useStore((s) => s.workspaceMode)
  const focusMode = useStore((s) => s.focusMode)
  const bookTitle = useStore((s) => s.book?.title)
  const init = useStore((s) => s.init)

  /* 沉浸写作:仅写作页生效(提前算好,下面的悬浮条效果要用) */
  const focus = focusMode && view === 'workspace' && workspaceMode === 'write'

  /* AI 助手面板:全局右栏,跨页面不重置;可折叠收起,释放中间写作空间 */
  const [aiOpen, setAiOpen] = useState(() => localStorage.getItem('aiPanelOpen') !== '0')

  const toggleAi = (): void => {
    setAiOpen((v) => {
      localStorage.setItem('aiPanelOpen', v ? '0' : '1')
      return !v
    })
  }

  /* 沉浸模式悬浮条:鼠标一动就浮现,静止 1.8 秒后自动隐去,绝不压着正文 */
  const [pillOn, setPillOn] = useState(false)
  useEffect(() => {
    if (!focus) {
      setPillOn(false)
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const reveal = (): void => {
      setPillOn(true)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setPillOn(false), 1800)
    }
    reveal() /* 进入沉浸时先亮一下,让用户知道怎么退出 */
    window.addEventListener('mousemove', reveal)
    return () => {
      window.removeEventListener('mousemove', reveal)
      if (timer) clearTimeout(timer)
    }
  }, [focus])

  useEffect(() => {
    void init()
  }, [init])

  /* 全局快捷键:Ctrl+K 命令面板 / Ctrl+S 保存 / Ctrl+Enter 生成整章 / Ctrl+1..4 切页 / F11 沉浸 / Esc 逐层退出 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /* 组件内已处理的快捷键(命令面板、聊天输入等)不冒泡到全局 */
      if (e.defaultPrevented) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const s = useStore.getState()
        s.setPaletteOpen(!s.paletteOpen)
        return
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void useStore.getState().saveNow()
        return
      }
      if (mod && e.key === 'Enter') {
        const s = useStore.getState()
        /* 弹窗打开时不抢:免得在设置/新建书弹窗里回车,背后悄悄生成了一章 */
        const modalOpen = s.settingsOpen || s.createBookOpen || s.paletteOpen
        if (!modalOpen && s.view === 'workspace' && s.workspaceMode === 'write' && s.chapter && !s.aiRunning && !s.inspire.busy) {
          e.preventDefault()
          void s.runGenerate('chapter')
        }
        return
      }
      if (mod && !e.shiftKey && MODE_KEYS[e.key]) {
        const s = useStore.getState()
        if (s.book) {
          e.preventDefault()
          s.setWorkspaceMode(MODE_KEYS[e.key])
        }
        return
      }
      /* F11 备选:写作页切换沉浸模式 */
      if (e.key === 'F11') {
        e.preventDefault()
        const s = useStore.getState()
        if (s.view === 'workspace' && s.workspaceMode === 'write') s.setFocusMode(!s.focusMode)
        return
      }
      if (e.key === 'Escape') {
        const s = useStore.getState()
        if (s.paletteOpen) s.setPaletteOpen(false)
        else if (s.settingsOpen) s.setSettingsOpen(false)
        else if (s.createBookOpen) s.setCreateBookOpen(false)
        else if (s.historyOpen) s.setHistoryOpen(false)
        else if (s.focusMode) s.setFocusMode(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* 关窗前同步兜底:把未落盘的正文与设定一次性写入,避免丢掉最后 900ms 防抖窗口内的输入 */
  useEffect(() => {
    const flush = () => {
      const s = useStore.getState()
      window.api.app.flush({
        dir: s.bookDir,
        book: s.book,
        chapter: s.dirty ? s.chapter : null,
        content: s.content
      })
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center t3">
        <span className="serif animate-pulse text-lg">正在铺纸研墨……</span>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {!focus && <Rail />}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {view === 'library' ? (
          <LibraryView />
        ) : (
          <>
            {!focus && <TopBar />}
            {/* 页面切换淡入(冷灰规范:全站统一 --bg 底,层次靠白卡与阴影);AI 面板在容器外,跨页面内容不重置 */}
            <div key={workspaceMode} className="view-fade flex min-h-0 flex-1 flex-col overflow-hidden">
              {workspaceMode === 'write' && <WriteView />}
              {workspaceMode === 'codex' && <CodexView />}
              {workspaceMode === 'outline' && <OutlineView />}
              {workspaceMode === 'import' && <ImportView />}
            </div>
            {!focus && <StatusBar />}
          </>
        )}

        {/* 沉浸模式悬浮条:进入时亮一下,鼠标动就浮现,静止后隐去(fade-up 动画) */}
        {focus && pillOn && (
          <div className="pointer-events-none fixed left-1/2 top-3 z-30 -translate-x-1/2">
            <div
              className="pointer-events-auto fade-up flex items-center gap-3 rounded-full px-4 py-1.5 text-xs shadow-lg"
              style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--t2)' }}
            >
              <span className="serif font-semibold" style={{ color: 'var(--text)' }}>
                {bookTitle ? `《${bookTitle}》` : ''}
              </span>
              <span className="t3">沉浸写作中</span>
              <button className="btn-outline !px-2 !py-0.5 !text-[11px]" onClick={() => useStore.getState().setFocusMode(false)}>
                退出 <span className="kbd">Esc</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 全局右栏:AI 助手(四大页面共用,定宽 340px,可收起;沉浸模式下隐藏) */}
      {view === 'workspace' && !focus && (
        <>
          {aiOpen ? (
            <div className="relative shrink-0" style={{ width: AI_PANEL_WIDTH }}>
              <button
                className="btn-ghost absolute right-2 top-2 z-10 !px-2"
                title="收起 AI 助手面板"
                onClick={toggleAi}
              >
                <PanelRightClose size={16} />
              </button>
              <AIPanel />
            </div>
          ) : (
            <button
              className="flex w-9 shrink-0 items-center justify-center"
              style={{ background: 'var(--panel)', borderLeft: '1px solid var(--border)' }}
              title="展开 AI 助手面板"
              onClick={toggleAi}
            >
              <PanelRightOpen size={16} />
            </button>
          )}
        </>
      )}

      <CommandPalette />
      <SettingsModal />
      <CreateBookModal />
      <HistoryModal />
      <Toast />
    </div>
  )
}
