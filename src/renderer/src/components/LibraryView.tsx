import { Archive, FolderOpen, Plus, Settings, Trash2 } from 'lucide-react'
import { totalWords, useStore } from '../store'

export default function LibraryView() {
  const books = useStore((s) => s.books)
  const settings = useStore((s) => s.settings)
  const openBookAt = useStore((s) => s.openBookAt)
  const removeBook = useStore((s) => s.removeBook)
  const backupBook = useStore((s) => s.backupBook)
  const setCreateBookOpen = useStore((s) => s.setCreateBookOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const showToast = useStore((s) => s.showToast)
  const updateSettings = useStore((s) => s.updateSettings)

  async function changeLibraryRoot() {
    const dir = await window.api.dialog.pickFolder()
    if (!dir) return
    await updateSettings({ libraryRoot: dir })
    await useStore.getState().refreshBooks()
    showToast('书库目录已切换')
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl px-10 py-12">
        {/* 顶部:22px 大标题 + 右侧辅助小字;右上角幽灵按钮组 + 主按钮 */}
        <div className="mb-10 flex items-end justify-between gap-6">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="shrink-0 text-[22px] font-semibold leading-tight">AI 网文工作台</h1>
            <p className="min-w-0 truncate text-xs t3">AI 辅助长篇中文小说创作 · 本地存储 · 支持任意大模型</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
          <div className="panel flex flex-col items-center gap-3 py-24 text-center">
            {/* 空状态:仅文字,无图形装饰 */}
            <p className="text-base font-medium t2">还没有书籍</p>
            <p className="max-w-md text-xs t3">
              点击右上角「新建书籍」开始创作。书籍数据保存在本地{' '}
              <code className="rounded px-1 py-0.5 text-xs" style={{ background: 'var(--panel-2)' }}>
                {settings.libraryRoot || '文档/AINovelStudio'}
              </code>{' '}
              目录,随时可整体备份。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {books.map(({ dir, book, broken }) => (
              <div
                key={dir}
                className="panel card-lift group relative cursor-pointer overflow-hidden p-5"
                style={{ borderColor: broken ? 'var(--danger)' : undefined }}
                onClick={() => void openBookAt(dir)}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-lg font-semibold leading-snug" title={book.title}>
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
                      className="rounded p-1 t3 opacity-0 transition hover:text-[var(--text)] group-hover:opacity-100"
                      title="立即备份这本书(完整复制到 _backups 目录)"
                      onClick={(e) => {
                        e.stopPropagation()
                        void backupBook(dir)
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
                  {book.description || '（暂无简介）'}
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
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
