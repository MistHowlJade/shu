import { FolderOpen, Plus, Settings, Trash2 } from 'lucide-react'
import { totalWords, useStore } from '../store'

export default function LibraryView() {
  const books = useStore((s) => s.books)
  const settings = useStore((s) => s.settings)
  const openBookAt = useStore((s) => s.openBookAt)
  const removeBook = useStore((s) => s.removeBook)
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
        {/* 书斋题头 */}
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="seal !m-0 !h-11 !w-11 !text-2xl">著</div>
              <div>
                <h1 className="serif text-3xl font-bold tracking-wide">AI 网文工作台</h1>
                <p className="mt-1 text-sm t2">
                  <span className="serif">「铺纸 · 研墨 · 落笔」</span> · AI 辅助长篇中文小说创作 · 本地存储 · 支持任意大模型
                </p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className="btn-outline" onClick={() => void changeLibraryRoot()}>
              <FolderOpen size={15} />
              书库目录
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
          <div className="panel flex flex-col items-center gap-4 py-24 text-center">
            <div className="seal !m-0 !h-14 !w-14 !text-3xl opacity-60">著</div>
            <p className="serif text-xl">书案还空着</p>
            <p className="max-w-md text-sm t2">
              点击「新建书籍」铺开第一张纸。书籍数据保存在本地{' '}
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
                className="group relative cursor-pointer overflow-hidden rounded-xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow)]"
                style={{
                  background: 'var(--panel)',
                  border: `1px solid ${broken ? 'var(--danger)' : 'var(--border)'}`
                }}
                onClick={() => void openBookAt(dir)}
              >
                {/* 封面顶端朱砂书签条 */}
                <span
                  className="absolute right-4 top-0 h-8 w-1.5 rounded-b transition-all group-hover:h-12"
                  style={{ background: 'var(--accent)' }}
                />
                <div className="flex items-start justify-between gap-2">
                  <h3 className="serif line-clamp-2 text-lg font-bold leading-snug" title={book.title}>
                    《{book.title}》
                  </h3>
                  {broken && (
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium"
                      style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)', color: 'var(--danger)' }}
                    >
                      文件损坏
                    </span>
                  )}
                  <button
                    className="shrink-0 rounded p-1 t3 opacity-0 transition hover:text-[var(--danger)] group-hover:opacity-100"
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
                </div>
                <p className="mt-0.5 text-xs t3">
                  {book.author || '未署名'} · {book.genre}
                </p>
                <p className="serif mt-3 line-clamp-2 min-h-10 text-sm leading-relaxed t2">
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
