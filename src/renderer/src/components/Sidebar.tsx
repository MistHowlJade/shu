import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, PanelLeftClose, Pencil, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import type { ChapterStatus } from '@shared/types'

const STATUS_META: Record<ChapterStatus, { label: string; dot: React.CSSProperties }> = {
  todo: { label: '待写', dot: { background: 'var(--faint)' } },
  draft: { label: '草稿', dot: { background: 'var(--warn)' } },
  done: { label: '完成', dot: { background: 'var(--ok)' } }
}

export default function Sidebar({ onCollapse }: { onCollapse?: () => void }) {
  const book = useStore((s) => s.book)
  const chapter = useStore((s) => s.chapter)
  const selectChapter = useStore((s) => s.selectChapter)
  const createChapter = useStore((s) => s.createChapter)
  const deleteChapter = useStore((s) => s.deleteChapter)
  const moveChapter = useStore((s) => s.moveChapter)
  const updateVolume = useStore((s) => s.updateVolume)
  const removeVolume = useStore((s) => s.removeVolume)
  const addVolume = useStore((s) => s.addVolume)
  const duplicateChapter = useStore((s) => s.duplicateChapter)
  const updateBook = useStore((s) => s.updateBook)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  /* 右键菜单与行内重命名状态 */
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  function submitRename(id: string): void {
    const title = renameDraft.trim()
    setRenamingId(null)
    if (!title) return
    void updateBook((draft) => {
      const meta = draft.chapters.find((c) => c.id === id)
      if (meta) meta.title = title
    })
  }

  if (!book) return null

  return (
    <>
      <aside
        className="panel flex w-60 shrink-0 flex-col overflow-hidden"
        style={{ background: 'var(--panel)' }}
      >
      <div className="flex shrink-0 items-center gap-1.5 px-3 pb-1 pt-3">
        <span className="serif text-[11px] font-semibold tracking-[0.25em] t3">目 录</span>
        <span className="t3 text-[11px]">{book.chapters.length} 章</span>
        {onCollapse && (
          <button className="btn-ghost ml-auto !p-1" title="收起章节栏" onClick={onCollapse}>
            <PanelLeftClose size={15} />
          </button>
        )}
      </div>

      <div className="max-h-full flex-1 overflow-auto px-2 py-2">
        {book.volumes.map((volume) => {
          const chapters = book.chapters.filter((c) => c.volumeId === volume.id)
          const isCollapsed = collapsed[volume.id] ?? false
          return (
            <div key={volume.id} className="mb-3">
              <div className="group flex items-center gap-1 px-1.5 py-1">
                <button
                  className="rounded p-0.5 t3 hover:text-[var(--text)]"
                  onClick={() => setCollapsed((m) => ({ ...m, [volume.id]: !isCollapsed }))}
                >
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
                <input
                  className="serif min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:bg-[var(--panel-2)] focus:bg-[var(--panel-2)]"
                  value={volume.title}
                  onChange={(e) => void updateVolume(volume.id, { title: e.target.value })}
                  title="点击编辑卷名"
                />
                <button
                  className="rounded p-1 opacity-0 transition accent group-hover:opacity-100"
                  title="在本卷新建章节"
                  onClick={() => void createChapter(volume.id)}
                >
                  <Plus size={14} />
                </button>
                <button
                  className="rounded p-1 opacity-0 transition danger group-hover:opacity-100"
                  title="删除本卷(需先清空章节)"
                  onClick={() => void removeVolume(volume.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {!isCollapsed && (
                <div>
                  {chapters.map((meta) => {
                    /* 全书全局章号,与 AI 上下文、导出 TXT、细纲页保持一致,不按卷重新计数 */
                    const index = book.chapters.findIndex((c) => c.id === meta.id) + 1
                    const active = chapter?.id === meta.id
                    return (
                      <div
                        key={meta.id}
                        className={`group relative flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition ${
                          active ? 'font-medium' : ''
                        }`}
                        style={
                          active
                            ? { background: 'var(--accent-soft)', color: 'var(--accent-ink)' }
                            : undefined
                        }
                        onMouseEnter={(e) => {
                          if (!active) e.currentTarget.style.background = 'var(--panel-2)'
                        }}
                        onMouseLeave={(e) => {
                          if (!active) e.currentTarget.style.background = ''
                        }}
                        onClick={() => void selectChapter(meta.id)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setMenu({ x: e.clientX, y: e.clientY, id: meta.id })
                        }}
                      >
                        {active && (
                          <span
                            className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full"
                            style={{ background: 'var(--accent)' }}
                          />
                        )}
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={STATUS_META[meta.status].dot}
                          title={STATUS_META[meta.status].label}
                        />
                        {/* 激活项整行进朱砂色系,未激活序号保持灰色,拉开主次 */}
                        <span
                          className="shrink-0 text-xs"
                          style={active ? { color: 'var(--accent-ink)', opacity: 0.72 } : { color: 'var(--t3)' }}
                        >
                          第{index}章
                        </span>
                        {renamingId === meta.id ? (
                          /* 行内重命名:回车/失焦提交,Esc 取消 */
                          <input
                            autoFocus
                            className="serif min-w-0 flex-1 rounded bg-[var(--panel-2)] px-1 text-sm outline-none"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              e.stopPropagation()
                              if (e.key === 'Enter') submitRename(meta.id)
                              if (e.key === 'Escape') setRenamingId(null)
                            }}
                            onBlur={() => submitRename(meta.id)}
                          />
                        ) : (
                          <span className="min-w-0 flex-1 truncate">{meta.title}</span>
                        )}
                        <span className="hidden shrink-0 items-center group-hover:flex">
                          <button
                            className="rounded p-0.5 t3 hover:text-[var(--accent)]"
                            title="上移"
                            onClick={(e) => {
                              e.stopPropagation()
                              void moveChapter(meta.id, -1)
                            }}
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            className="rounded p-0.5 t3 hover:text-[var(--accent)]"
                            title="下移"
                            onClick={(e) => {
                              e.stopPropagation()
                              void moveChapter(meta.id, 1)
                            }}
                          >
                            <ArrowDown size={12} />
                          </button>
                          <button
                            className="rounded p-0.5 t3 hover:text-[var(--danger)]"
                            title="删除本章"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (window.confirm(`确定删除「${meta.title}」吗?`)) void deleteChapter(meta.id)
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </span>
                      </div>
                    )
                  })}
                  {chapters.length === 0 && (
                    <p className="px-3 py-1 text-xs t3">本卷暂无章节,悬停卷名点 + 新建</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {/* 底部:小幽灵按钮靠右,不占满整行 */}
      <div className="flex justify-end p-3 pt-2">
        <button className="btn-outline !h-8 !px-2.5 !text-xs" onClick={() => void addVolume()}>
          <Plus size={13} />
          新增一卷
        </button>
      </div>
      </aside>

      {/* 章节右键菜单:重命名 / 复制 / 删除 */}
      {menu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu(null)
            }}
          />
          <div
            className="panel fixed z-50 w-36 p-1"
            style={{
              left: Math.min(menu.x, window.innerWidth - 160),
              top: Math.min(menu.y, window.innerHeight - 140),
              boxShadow: 'var(--shadow)'
            }}
          >
            <button
              className="palette-item"
              onClick={() => {
                setRenamingId(menu.id)
                setRenameDraft(book.chapters.find((c) => c.id === menu.id)?.title ?? '')
                setMenu(null)
              }}
            >
              <Pencil size={14} />
              重命名
            </button>
            <button
              className="palette-item"
              onClick={() => {
                void duplicateChapter(menu.id)
                setMenu(null)
              }}
            >
              <Copy size={14} />
              复制章节
            </button>
            <button
              className="palette-item"
              style={{ color: 'var(--danger)' }}
              onClick={() => {
                const meta = book.chapters.find((c) => c.id === menu.id)
                if (meta && window.confirm(`确定删除「${meta.title}」吗?`)) void deleteChapter(menu.id)
                setMenu(null)
              }}
            >
              <Trash2 size={14} />
              删除章节
            </button>
          </div>
        </>
      )}
    </>
  )
}
