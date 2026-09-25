import { useEffect } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { useStore } from './store'
import type { WorkspaceMode } from './store'
import LibraryView from './components/LibraryView'
import TopBar from './components/TopBar'
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

export default function App() {
  const ready = useStore((s) => s.ready)
  const view = useStore((s) => s.view)
  const workspaceMode = useStore((s) => s.workspaceMode)
  const focusMode = useStore((s) => s.focusMode)
  const aiOpen = useStore((s) => s.aiOpen)
  const aiRunning = useStore((s) => s.aiRunning)
  const autoWrite = useStore((s) => s.autoWrite)
  const bookTitle = useStore((s) => s.book?.title)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const createBookOpen = useStore((s) => s.createBookOpen)
  const paletteOpen = useStore((s) => s.paletteOpen)
  const historyOpen = useStore((s) => s.historyOpen)
  const theme = useStore((s) => s.settings.theme)
  const init = useStore((s) => s.init)

  /* 沉浸写作:仅写作页生效(提前算好,下面的悬浮条效果要用) */
  const focus = focusMode && view === 'workspace' && workspaceMode === 'write'
  const modalOpen = settingsOpen || createBookOpen || paletteOpen || historyOpen

  /* Windows 隐藏式标题栏:系统悬浮按钮画在所有内容之上,颜色必须随窗口状态同步,
     否则弹窗压暗/沉浸/书库场景下,右上角会出现一块对不上的色斑 */
  useEffect(() => {
    const dark = theme === 'dark'
    let color: string
    if (modalOpen) color = dark ? '#20242c' : '#b4b4b7'
    else if (view === 'library') color = dark ? '#141820' : '#f9f9fa'
    else if (focus) color = dark ? '#12151b' : '#f7f7f8'
    else color = dark ? '#191d24' : '#ffffff'
    try {
      void window.api?.app?.setThemeColors?.({ color, symbolColor: dark ? '#e9ecf1' : '#17181b' })
    } catch {
      /* 非支持的宿主环境静默跳过 */
    }
  }, [theme, view, focus, modalOpen])

  /* 沉浸模式悬浮条:鼠标一动就浮现,静止 1.8 秒后自动隐去,绝不压着正文 */
  useEffect(() => {
    if (!focus) return
    const pill = document.getElementById('focus-pill')
    if (!pill) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const reveal = (): void => {
      pill.dataset.on = 'true'
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        pill.dataset.on = 'false'
      }, 1800)
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

  /* 全局快捷键:Ctrl+K 命令面板 / Ctrl+I AI抽屉 / Ctrl+S 保存 / Ctrl+Enter 生成整章 / Ctrl+1..4 切页 / F11 沉浸 / Esc 逐层退出 */
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
      if (mod && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        const s = useStore.getState()
        if (s.view === 'workspace') s.setAiOpen(!s.aiOpen)
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
        else if (s.aiOpen) s.setAiOpen(false)
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
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <span
          className="h-2 w-2 animate-pulse rounded-full"
          style={{
            background: 'var(--accent)',
            boxShadow: '0 0 14px color-mix(in srgb, var(--accent) 65%, transparent)'
          }}
        />
        <span className="serif text-base tracking-[0.4em] t2">正在铺纸研墨</span>
      </div>
    )
  }

  const aiBusy = aiRunning || !!autoWrite?.running

  return (
    <div className="flex h-full overflow-hidden">
      {view === 'library' ? (
        <LibraryView />
      ) : (
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!focus && <TopBar />}
          {/* 页面切换淡入;内容区只有一条顶栏,其余全是画布 */}
          <div key={workspaceMode} className="view-fade flex min-h-0 flex-1 flex-col overflow-hidden">
            {workspaceMode === 'write' && <WriteView />}
            {workspaceMode === 'codex' && <CodexView />}
            {workspaceMode === 'outline' && <OutlineView />}
            {workspaceMode === 'import' && <ImportView />}
          </div>
        </div>
      )}

      {/* AI 助手抽屉:按需从右侧滑出,浮在内容之上,不挤占写作区 */}
      {view === 'workspace' && !focus && aiOpen && <AIPanel />}

      {/* 抽屉收起时的生成进度:右下角小浮标,点一下展开抽屉 */}
      {view === 'workspace' && !aiOpen && aiBusy && (
        <button
          className="fade-up fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium"
          style={{
            background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 90%, #fff 10%), var(--accent) 58%, var(--accent-hover))',
            color: '#fff',
            boxShadow: 'var(--inset-light), 0 10px 26px -8px color-mix(in srgb, var(--accent) 62%, transparent)'
          }}
          onClick={() => useStore.getState().setAiOpen(true)}
          title="展开 AI 助手 (Ctrl+I)"
        >
          <Loader2 size={13} className="animate-spin" />
          {autoWrite?.running ? `自动连写 ${autoWrite.done}/${autoWrite.total}` : 'AI 生成中'}
        </button>
      )}

      {/* 沉浸模式悬浮条:进入时亮一下,鼠标动就浮现,静止后隐去(fade 动画由 data-on 驱动) */}
      {focus && (
        <div
          id="focus-pill"
          data-on="false"
          className="pointer-events-none fixed left-1/2 top-3 z-30 -translate-x-1/2 opacity-0 transition-opacity duration-300 data-[on=true]:opacity-100"
        >
          <div
            className="glass pointer-events-auto flex items-center gap-3 rounded-full px-4 py-1.5 text-xs"
            style={{
              border: '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
              color: 'var(--t2)',
              boxShadow: 'var(--shadow-pop)'
            }}
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

      {/* 沉浸模式下的 AI 入口:平时藏起来,生成时才浮出 */}
      {focus && aiBusy && (
        <button
          className="fade-up fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium"
          style={{
            background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 90%, #fff 10%), var(--accent) 58%, var(--accent-hover))',
            color: '#fff',
            boxShadow: 'var(--inset-light), 0 10px 26px -8px color-mix(in srgb, var(--accent) 62%, transparent)'
          }}
          onClick={() => useStore.getState().setFocusMode(false)}
          title="退出沉浸查看生成进度"
        >
          <Sparkles size={13} />
          AI 生成中 · 点击查看
        </button>
      )}

      <CommandPalette />
      <SettingsModal />
      <CreateBookModal />
      <HistoryModal />
      <Toast />
    </div>
  )
}
