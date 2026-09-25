import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, PenLine, Plus } from 'lucide-react'
import { useStore } from '../store'

const STATUS_LABEL: Record<string, string> = { todo: '待写', draft: '草稿', done: '完成' }

/** 细进度条:全书/分卷完成率可视化(渐变填充 + 内凹轨道) */
function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
        style={{
          background: 'color-mix(in srgb, var(--text) 7%, var(--bg))',
          boxShadow: 'inset 0 1px 2px rgba(18, 20, 26, 0.08)'
        }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 68%, #fff 32%), var(--accent))',
            boxShadow: '0 0 8px -2px color-mix(in srgb, var(--accent) 55%, transparent)',
            transition: 'width 0.4s cubic-bezier(0.32, 0.72, 0, 1)'
          }}
        />
      </div>
      <span className="shrink-0 text-[11px] t3">
        {done}/{total} 章{pct > 0 ? ` · ${pct}%` : ''}
      </span>
    </div>
  )
}

function DetailPane() {
  const book = useStore((s) => s.book)
  const chapter = useStore((s) => s.chapter)
  const setOutline = useStore((s) => s.setOutline)
  const saveNow = useStore((s) => s.saveNow)
  const cycleChapterStatus = useStore((s) => s.cycleChapterStatus)
  const renameChapter = useStore((s) => s.renameChapter)
  const setWorkspaceMode = useStore((s) => s.setWorkspaceMode)

  if (!chapter) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 t3">
        <p className="text-sm font-medium t2">从左侧选择一章,编写它的情节细纲</p>
        <p className="text-xs t3">细纲是「生成整章」与自动连写的依据</p>
      </div>
    )
  }
  const meta = book?.chapters.find((c) => c.id === chapter.id)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
        <input
          className="serif min-w-0 flex-1 bg-transparent text-base font-semibold outline-none"
          value={chapter.title}
          onChange={(e) => renameChapter(e.target.value)}
          onBlur={() => void saveNow()}
          placeholder="章节标题"
        />
        {meta && (
          <button className="btn-outline !py-1 !text-xs" onClick={() => void cycleChapterStatus(meta.id)}>
            {STATUS_LABEL[meta.status]}
          </button>
        )}
        {/* 细纲 → 正文快速联动 */}
        <button
          className="btn-secondary !py-1 !text-xs"
          title="跳到写作页编辑本章正文"
          onClick={() => setWorkspaceMode('write')}
        >
          <PenLine size={13} />
          去写正文
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <label className="field-label">本章细纲(冲突、爽点、结尾钩子;自动连写与「生成整章」都依赖它)</label>
        <textarea
          className="field-input min-h-40 resize-y"
          value={chapter.outline}
          onChange={(e) => setOutline(e.target.value)}
          onBlur={() => void saveNow()}
          placeholder="1. 冲突:……&#10;2. 爽点:……&#10;3. 结尾钩子:……"
        />
        {chapter.summary.trim() && (
          <>
            <label className="field-label mt-4">本章前情摘要(写完正文后自动/手动生成,后续章节的记忆来源)</label>
            <div className="panel serif p-3 text-sm leading-relaxed t2">{chapter.summary}</div>
          </>
        )}
      </div>
    </div>
  )
}

/** 大纲规划:全书简介、风格指令、各卷规划、章节细纲,一屏完成 */
export default function OutlineView() {
  const book = useStore((s) => s.book)
  const chapter = useStore((s) => s.chapter)
  const updateBook = useStore((s) => s.updateBook)
  const addVolume = useStore((s) => s.addVolume)
  const createChapter = useStore((s) => s.createChapter)
  const selectChapter = useStore((s) => s.selectChapter)
  const [folded, setFolded] = useState<Record<string, boolean>>({})

  /* 卸载时把未持久化的编辑写盘(书级 + 章节细纲) */
  useEffect(() => {
    return () => {
      const state = useStore.getState()
      if (state.book) void state.updateBook(() => undefined)
      if (state.chapter && state.dirty) void state.saveNow()
    }
  }, [])

  if (!book) return null

  const editBookField = (patch: Partial<typeof book>) => {
    useStore.setState((state) => (state.book ? { book: { ...state.book, ...patch } } : {}))
  }
  const doneChapters = book.chapters.filter((c) => c.status === 'done').length

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      {/* 简介 + 风格:各自独立白卡 */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="panel p-5">
          <label className="field-label">全书简介(AI 了解主线的第一入口)</label>
          <textarea
            className="field-input min-h-28 resize-y !py-2.5"
            value={book.description}
            onChange={(e) => editBookField({ description: e.target.value })}
            onBlur={() => void updateBook(() => undefined)}
          />
        </div>
        <div className="panel p-5">
          <label className="field-label">写作风格指令(发给 AI 的 system prompt)</label>
          <textarea
            className="field-input min-h-28 resize-y font-mono !py-2.5 !text-xs"
            value={book.style}
            onChange={(e) => editBookField({ style: e.target.value })}
            onBlur={() => void updateBook(() => undefined)}
          />
        </div>
      </div>

      {/* 全书完成率 */}
      <div className="panel mt-5 flex items-center gap-3 px-5 py-3">
        <span className="shrink-0 text-base font-semibold">全书进度</span>
        <ProgressBar done={doneChapters} total={book.chapters.length} />
      </div>

      {/* 各卷规划(带分卷完成率) */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-semibold">各卷剧情规划</h3>
          <button className="btn-outline !h-8 !px-2.5 !text-xs" onClick={() => void addVolume()}>
            <Plus size={13} />
            新增一卷
          </button>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {book.volumes.map((volume) => {
            const volChapters = book.chapters.filter((c) => c.volumeId === volume.id)
            const volDone = volChapters.filter((c) => c.status === 'done').length
            return (
              <div key={volume.id} className="panel p-5">
                <input
                  className="w-full bg-transparent text-sm font-semibold outline-none"
                  value={volume.title}
                  onChange={(e) => {
                    const value = e.target.value
                    useStore.setState((state) => {
                      if (!state.book) return {}
                      return {
                        book: {
                          ...state.book,
                          volumes: state.book.volumes.map((v) => (v.id === volume.id ? { ...v, title: value } : v))
                        }
                      }
                    })
                  }}
                  onBlur={() => void updateBook(() => undefined)}
                />
                {volChapters.length > 0 && (
                  <div className="mt-1.5">
                    <ProgressBar done={volDone} total={volChapters.length} />
                  </div>
                )}
                <textarea
                  className="field-input mt-2 min-h-20 resize-y !py-2.5 !text-xs"
                  placeholder="本卷主线、关键冲突、结尾高潮"
                  value={volume.summary}
                  onChange={(e) => {
                    const value = e.target.value
                    useStore.setState((state) => {
                      if (!state.book) return {}
                      return {
                        book: {
                          ...state.book,
                          volumes: state.book.volumes.map((v) => (v.id === volume.id ? { ...v, summary: value } : v))
                        }
                      }
                    })
                  }}
                  onBlur={() => void updateBook(() => undefined)}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* 章节细纲:左列表(可折叠) + 右编辑 */}
      <div className="panel mt-5 flex min-h-96 overflow-hidden">
        <div className="w-72 shrink-0 overflow-auto p-2" style={{ borderRight: '1px solid var(--border)' }}>
          {book.volumes.map((volume) => {
            const chapters = book.chapters.filter((c) => c.volumeId === volume.id)
            const isFolded = folded[volume.id] ?? false
            return (
              <div key={volume.id} className="mb-3">
                <div className="flex items-center gap-1 px-2 py-1">
                  <button
                    className="rounded p-0.5 t3 hover:text-[var(--text)]"
                    title={isFolded ? '展开本卷' : '收起本卷'}
                    onClick={() => setFolded((m) => ({ ...m, [volume.id]: !isFolded }))}
                  >
                    {isFolded ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  </button>
                  <p className="serif min-w-0 flex-1 truncate text-xs font-semibold tracking-widest t3">{volume.title}</p>
                  <button
                    className="rounded p-0.5 t3 hover:text-[var(--accent)]"
                    title="在本卷新建章节"
                    onClick={() => void createChapter(volume.id)}
                  >
                    <Plus size={13} />
                  </button>
                </div>
                {!isFolded &&
                  chapters.map((meta) => {
                    /* 全书全局章号,与侧栏/AI/导出一致 */
                    const index = book.chapters.findIndex((c) => c.id === meta.id) + 1
                    const active = chapter?.id === meta.id
                    return (
                      <button
                        key={meta.id}
                        className={`row-item flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                          active ? 'active' : ''
                        }`}
                        style={active ? { background: 'var(--accent-soft)', color: 'var(--accent-ink)' } : undefined}
                        onClick={() => void selectChapter(meta.id)}
                      >
                        <span className="shrink-0 text-xs t3">第{index}章</span>
                        <span className="min-w-0 flex-1 truncate">{meta.title}</span>
                        <span className="shrink-0 text-[11px] t3">
                          {STATUS_LABEL[meta.status]}
                          {meta.wordCount > 0 ? ` · ${meta.wordCount.toLocaleString('zh-CN')}字` : ''}
                        </span>
                      </button>
                    )
                  })}
                {chapters.length === 0 && (
                  <p className="px-3 py-1 text-xs t3">本卷暂无章节,点右上 + 新建</p>
                )}
              </div>
            )
          })}
        </div>
        <DetailPane />
      </div>
    </div>
  )
}
