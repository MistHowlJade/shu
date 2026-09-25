import { Archive, FileArchive, FolderOpen, Plus, Settings, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { totalWords, useStore } from '../store'
import BackupModal from './BackupModal'

/* 隐藏式标题栏:书库页没有顶栏,顶部留一条可拖动区域用于移动窗口 */
const DRAG = { WebkitAppRegion: 'drag', height: 44 } as CSSProperties

export default function LibraryView() {
  const books = useStore((s) => s.books)
  const settings = useStore((s) => s.settings)
  const openBookAt = useStore((s) => s.openBookAt)
  const removeBook = useStore((s) => s.removeBook)
  const setCreateBookOpen = useStore((s) => s.setCreateBookOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const showToast = useStore((s) => s.showToast)
  const updateSettings = useStore((s) => s.updateSettings)
  const [backupFor, setBackupFor] = useState<{ dir: string; title: string } | null>(null)

  async function changeLibraryRoot() {
    const dir = await window.api.dialog.pickFolder()
    if (!dir) return
    await updateSettings({ libraryRoot: dir })
    await useStore.getState().refreshBooks()
    showToast('书库目录已切换')
  }

  /* 书脊渐变:按书名散列取一条克制的双色渐变,让每本书有自己的"封面色" */
  const SPINES: [string, string][] = [
    ['#a8433a', '#e0a180'],
    ['#3d5a80', '#98c1d9'],
    ['#6d597a', '#e0b1cb'],
    ['#456a4d', '#a3c9a8'],
    ['#7f5a2e', '#dfb986'],
    ['#41506b', '#9db4d0']
  ]
  function spineFor(title: string): [string, string] {
    let h = 0
    for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0
    return SPINES[h % SPINES.length]
  }

  /* 工程包:整本书(章节+设定+历史)打包导出 / 从包导入为新书 */
  async function exportPackage(dir: string): Promise<void> {
    const r = await window.api.books.exportPackage(dir)
    if (!r) return
    showToast(`已导出《${r.title}》工程包(${r.chapterCount} 章)`)
  }

  async function importPackage(): Promise<void> {
    const r = await window.api.books.importPackage()
    if (!r) return
    await useStore.getState().refreshBooks()
    showToast(`已导入《${r.title}》(共 ${r.chapterCount} 章)`)
  }

  return (
    <div className="relative h-full overflow-auto">
      {/* 顶部拖动条:补上被隐藏的系统标题栏的移动窗口能力 */}
      <div className="absolute inset-x-0 top-0 z-10" style={DRAG} />
      <div className="mx-auto max-w-5xl px-10 py-14">
        {/* 顶部:大标题 + 辅助小字;右上角操作按钮组 */}
        <div className="mb-10 flex items-end justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-2">
            <h1
              className="shrink-0 text-[26px] font-bold leading-tight tracking-tight"
              style={{
                backgroundImage: 'linear-gradient(105deg, var(--text) 55%, color-mix(in srgb, var(--accent) 55%, var(--text)))',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent'
              }}
            >
              AI 网文工作台
            </h1>
            <p className="min-w-0 truncate text-[13px] t3">
              AI 辅助长篇中文小说创作 · 本地存储 · 支持任意大模型
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className="btn-outline" onClick={() => void importPackage()}>
              <FileArchive size={15} />
              导入工程包
            </button>
            <button className="btn-outline" onClick={() => void changeLibraryRoot()}>
              <FolderOpen size={15} />
              书库目录
            </button>
            <button
              className="btn-outline"
              title="打开本地备份目录(每本书保留最近 7 份快照,打开书籍时每日自动备份)"
              onClick={() => void window.api.books.openBackups()}
            >
              <Archive size={15} />
              备份
            </button>
            <button className="btn-outline" onClick={() => setSettingsOpen(true)}>
              <Settings size={15} />
              设置
            </button>
            <button className="btn-primary" onClick={() => setCreateBookOpen(true)}>
              <Plus size={15} />
              新建书籍
            </button>
          </div>
        </div>

        {books.length === 0 ? (
          <div
            className="flex flex-col items-center gap-4 rounded-2xl border border-dashed py-24 text-center"
            style={{ borderColor: 'var(--border-strong)' }}
          >
            <span
              className="h-2.5 w-2.5 animate-pulse rounded-full"
              style={{
                background: 'var(--accent)',
                boxShadow: '0 0 16px color-mix(in srgb, var(--accent) 60%, transparent)'
              }}
            />
            <p className="text-base font-medium t2">研墨已毕,只待开卷</p>
            <p className="max-w-md text-[13px] t3">
              点击右上角「新建书籍」开始创作。书籍数据保存在本地{' '}
              <code className="rounded px-1 py-0.5 text-xs" style={{ background: 'var(--panel-2)' }}>
                {settings.libraryRoot || '文档/AINovelStudio'}
              </code>{' '}
              目录,随时可整体备份。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {books.map(({ dir, book, broken }) => {
              const [c1, c2] = spineFor(book.title)
              return (
                <div
                  key={dir}
                  className="panel card-lift group relative cursor-pointer overflow-hidden p-5 pl-6"
                  style={{ borderColor: broken ? 'var(--danger)' : undefined }}
                  onClick={() => void openBookAt(dir)}
                >
                  {/* 书脊:全高渐变细条,浅一档的同色晕染 */}
                  <span
                    className="absolute inset-y-4 left-0 w-[3px] rounded-r-full"
                    style={{ background: `linear-gradient(180deg, ${c1}, ${c2})`, opacity: 0.85 }}
                  />
                  <span
                    className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-[0.07]"
                    style={{ background: `radial-gradient(circle, ${c1}, transparent 70%)` }}
                  />
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="serif line-clamp-2 text-xl font-semibold leading-snug" title={book.title}>
                      {book.title}
                    </h3>
                  {broken && (
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium"
                      style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', color: 'var(--danger)' }}
                    >
                      文件损坏
                    </span>
                  )}
                  <span className="flex shrink-0 items-center">
                    <button
                      className="rounded p-1 t3 opacity-0 transition hover:text-[var(--accent)] group-hover:opacity-100"
                      title="导出整本书工程包(章节+设定+历史,用于换机迁移)"
                      onClick={(e) => {
                        e.stopPropagation()
                        void exportPackage(dir)
                      }}
                    >
                      <FileArchive size={15} />
                    </button>
                    <button
                      className="rounded p-1 t3 opacity-0 transition hover:text-[var(--text)] group-hover:opacity-100"
                      title="备份时间线与恢复"
                      onClick={(e) => {
                        e.stopPropagation()
                        setBackupFor({ dir, title: book.title })
                      }}
                    >
                      <Archive size={15} />
                    </button>
                    <button
                      className="rounded p-1 t3 opacity-0 transition hover:text-[var(--danger)] group-hover:opacity-100"
                      title="删除书籍(移入回收站)"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm(`确定删除《${book.title}》吗?书籍文件将移入回收站。`)) {
                          void removeBook(dir)
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </span>
                  </div>
                  <p className="mt-1 text-xs t3">
                    {book.author || '未署名'} · {book.genre}
                  </p>
                  <p className="mt-3 line-clamp-2 min-h-10 text-[13px] leading-relaxed t2">
                    {book.description || '(暂无简介)'}
                  </p>
                  <div
                    className="mt-4 flex items-center gap-3 border-t pt-3 text-xs t3"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span>{book.chapters.length} 章</span>
                    <span>{totalWords(book).toLocaleString('zh-CN')} 字</span>
                    <span className="ml-auto">{new Date(book.updatedAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {backupFor && <BackupModal dir={backupFor.dir} title={backupFor.title} onClose={() => setBackupFor(null)} />}
    </div>
  )
}
