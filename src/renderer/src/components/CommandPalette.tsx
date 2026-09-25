import { useEffect, useMemo, useRef, useState } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import {
  BookOpen,
  Download,
  FileArchive,
  FilePlus2,
  FolderOpen,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Moon,
  PenLine,
  ScanSearch,
  Save,
  Search,
  Settings,
  Sun,
  Vault,
  Wand2
} from 'lucide-react'
import { useStore } from '../store'

interface Cmd {
  id: string
  label: string
  group: string
  kbd?: string
  icon: typeof PenLine
  run: () => void
}

/** 把 label 中命中的查询片段染成主色,一眼看清匹配了哪里 */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase()
  if (!q) return <>{text}</>
  const lower = text.toLowerCase()
  const parts: React.ReactNode[] = []
  let cursor = 0
  let hit = lower.indexOf(q)
  while (hit !== -1) {
    if (hit > cursor) parts.push(text.slice(cursor, hit))
    parts.push(
      <mark key={hit} className="bg-transparent font-semibold" style={{ color: 'var(--accent)' }}>
        {text.slice(hit, hit + q.length)}
      </mark>
    )
    cursor = hit + q.length
    hit = lower.indexOf(q, cursor)
  }
  parts.push(text.slice(cursor))
  return <>{parts}</>
}

/**
 * Ctrl+K 命令面板:键盘优先直达所有页面与常用操作。
 * 可用项随当前状态(是否打开书/是否有章节)动态生成。
 */
export default function CommandPalette() {
  const open = useStore((s) => s.paletteOpen)
  const setPaletteOpen = useStore((s) => s.setPaletteOpen)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const commands = useMemo<Cmd[]>(() => {
    const s = useStore.getState()
    const hasBook = !!s.book && s.view === 'workspace'
    const hasChapter = hasBook && !!s.chapter
    const list: Cmd[] = []

    /* 页面(切工作区必须有打开的书;在书库页这些命令是空操作,直接不放) */
    if (hasBook) {
      list.push({
        id: 'go-write',
        label: '打开 · 写作',
        group: '页面',
        kbd: 'Ctrl+1',
        icon: PenLine,
        run: () => s.setWorkspaceMode('write')
      })
      list.push({
        id: 'go-codex',
        label: '打开 · 设定中心',
        group: '页面',
        kbd: 'Ctrl+2',
        icon: Vault,
        run: () => s.setWorkspaceMode('codex')
      })
      list.push({
        id: 'go-outline',
        label: '打开 · 大纲规划',
        group: '页面',
        kbd: 'Ctrl+3',
        icon: MapIcon,
        run: () => s.setWorkspaceMode('outline')
      })
      list.push({
        id: 'go-import',
        label: '打开 · 拆书扫书',
        group: '页面',
        kbd: 'Ctrl+4',
        icon: ScanSearch,
        run: () => s.setWorkspaceMode('import')
      })
    }
    if (s.view === 'workspace') {
      list.push({ id: 'go-library', label: '返回书库', group: '页面', icon: BookOpen, run: () => void s.backToLibrary() })
    } else {
      list.push({
        id: 'new-book',
        label: '新建书籍',
        group: '页面',
        icon: FilePlus2,
        run: () => s.setCreateBookOpen(true)
      })
    }

    /* 写作 AI(仅写作页可用) */
    if (hasChapter && s.workspaceMode === 'write') {
      list.push({
        id: 'gen-chapter',
        label: 'AI · 生成整章初稿',
        group: '写作',
        kbd: 'Ctrl+Enter',
        icon: Wand2,
        run: () => void s.runGenerate('chapter')
      })
      list.push({
        id: 'gen-outline',
        label: 'AI · 生成本章细纲',
        group: '写作',
        icon: Wand2,
        run: () => void s.runGenerate('outline')
      })
      list.push({
        id: 'gen-summary',
        label: 'AI · 生成前情摘要',
        group: '写作',
        icon: Wand2,
        run: () => void s.runGenerate('summary')
      })
      list.push(
        s.focusMode
          ? { id: 'focus', label: '退出沉浸写作', group: '写作', kbd: 'Esc', icon: Minimize2, run: () => s.setFocusMode(false) }
          : {
              id: 'focus',
              label: '进入沉浸写作(隐藏所有面板)',
              group: '写作',
              kbd: 'Esc 退出',
              icon: Maximize2,
              run: () => s.setFocusMode(true)
            }
      )
      const volumeId = s.book?.volumes[0]?.id
      if (volumeId) {
        list.push({
          id: 'new-chapter',
          label: '新建章节',
          group: '写作',
          icon: FilePlus2,
          run: () => void s.createChapter(volumeId)
        })
      }
    }

    /* 全局 */
    if (s.view === 'workspace') {
      list.push({ id: 'save', label: '保存当前章节', group: '全局', kbd: 'Ctrl+S', icon: Save, run: () => void s.saveNow() })
      list.push({
        id: 'ai-drawer',
        label: s.aiOpen ? '收起 AI 助手抽屉' : '展开 AI 助手抽屉',
        group: '全局',
        kbd: 'Ctrl+I',
        icon: Wand2,
        run: () => s.setAiOpen(!s.aiOpen)
      })
      list.push({ id: 'export', label: '导出全书 TXT', group: '全局', icon: Download, run: () => void s.exportTxt() })
      list.push({
        id: 'export-done',
        label: '导出已完成章节 TXT',
        group: '全局',
        icon: Download,
        run: () => void s.exportTxt({ doneOnly: true })
      })
      list.push({
        id: 'export-volumes',
        label: '分卷导出 TXT(每卷一个文件)',
        group: '全局',
        icon: Download,
        run: () => {
          void (async () => {
            if (!s.bookDir) return
            const r = await window.api.books.exportVolumes(s.bookDir)
            if (r) s.showToast('已分卷导出 ' + r.files.length + ' 个文件')
          })()
        }
      })
      list.push({
        id: 'export-package',
        label: '导出整本书 · 工程包(换机迁移)',
        group: '全局',
        icon: FileArchive,
        run: () => {
          if (s.bookDir) void window.api.books.exportPackage(s.bookDir)
        }
      })
    }
    list.push({ id: 'settings', label: '打开设置', group: '全局', icon: Settings, run: () => s.setSettingsOpen(true) })
    list.push({
      id: 'theme',
      label: s.settings.theme === 'dark' ? '切到浅色(白日书房)' : '切到深色(夜间书房)',
      group: '全局',
      icon: s.settings.theme === 'dark' ? Sun : Moon,
      run: () => void s.updateSettings({ theme: s.settings.theme === 'dark' ? 'light' : 'dark' })
    })
    if (s.view === 'library') {
      list.push({
        id: 'pick-root',
        label: '更换书库目录',
        group: '全局',
        icon: FolderOpen,
        run: () => void (async () => {
          const dir = await window.api.dialog.pickFolder()
          if (!dir) return
          await s.updateSettings({ libraryRoot: dir })
          await useStore.getState().refreshBooks()
        })()
      })
    }
    return list
  }, [open])

  /* 过滤:按中文子串匹配标签 */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)
    )
  }, [commands, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      /* 等浮层渲染后再聚焦输入框 */
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  /* 高亮项滚入视野 */
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, filtered])

  /* Tab 只在面板内循环;关闭时焦点还原 */
  const cardRef = useRef<HTMLDivElement>(null)
  useFocusTrap(cardRef, open)

  if (!open) return null

  const exec = (cmd: Cmd): void => {
    setPaletteOpen(false)
    cmd.run()
  }

  let lastGroup = ''

  return (
    <div
      className="modal-backdrop !z-50 !items-start !pt-[12vh]"
      onClick={() => setPaletteOpen(false)}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className="modal-card fade-up w-full max-w-xl overflow-hidden outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <Search size={15} className="t3" />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="输入命令,如:写作、生成整章、设置……"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => (i + 1) % Math.max(1, filtered.length))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => (i - 1 + filtered.length) % Math.max(1, filtered.length))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const cmd = filtered[active]
                if (cmd) exec(cmd)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                setPaletteOpen(false)
              }
            }}
          />
          <span className="kbd">Esc 关闭</span>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-auto p-2">
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm t3">没有匹配的命令</p>}
          {filtered.map((cmd, i) => {
            const showGroup = cmd.group !== lastGroup
            lastGroup = cmd.group
            const Icon = cmd.icon
            return (
              <div key={cmd.id}>
                {showGroup && (
                  <p className="t3 px-3 pb-1 pt-3 text-[11px] font-medium tracking-widest">{cmd.group}</p>
                )}
                <div className="palette-item" data-active={i === active} onMouseEnter={() => setActive(i)} onClick={() => exec(cmd)}>
                  <Icon size={15} />
                  <span className="truncate">
                    <Highlight text={cmd.label} query={query} />
                  </span>
                  {cmd.kbd && <span className="kbd">{cmd.kbd}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
