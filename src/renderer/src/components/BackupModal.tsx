import { Archive, History, Loader2, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { useFocusTrap } from '../hooks/useFocusTrap'
import type { Book } from '@shared/types'

interface Snapshot {
  name: string
  time: number
  chapterCount: number
}

/** 备份时间线:列出 _backups 快照,可一键备份,可恢复到任意时点(恢复前自动兜底快照) */
export default function BackupModal({ dir, title, onClose }: { dir: string; title: string; onClose: () => void }) {
  const showToast = useStore((s) => s.showToast)
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null)
  const [busy, setBusy] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  useFocusTrap(cardRef, true)

  async function load(): Promise<void> {
    setSnapshots(await window.api.books.snapshots(dir))
  }

  useEffect(() => {
    void load()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir])

  async function backupNow(): Promise<void> {
    setBusy(true)
    try {
      const r = await window.api.books.backup(dir, true)
      if (r.skipped && r.reason === 'empty') showToast('这本书还没有正文,无需备份', 'error')
      else showToast('已备份')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function restore(name: string): Promise<void> {
    if (!window.confirm(`将把《${title}》恢复到该快照时点。\n当前内容会先自动备份为一份「恢复前」快照,随时可再恢复回来。确定?`)) {
      return
    }
    setBusy(true)
    try {
      const book: Book = await window.api.books.restoreSnapshot(dir, name)
      showToast(`已恢复到该时点(共 ${book.chapters.length} 章)`)
      await useStore.getState().refreshBooks()
      await load()
    } catch (err) {
      showToast(`恢复失败:${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={cardRef}
        tabIndex={-1}
        className="modal-card flex max-h-[80vh] w-full max-w-lg flex-col p-6 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="serif flex items-center gap-2 text-lg font-semibold tracking-wide">
            <History size={17} />
            备份时间线
          </h2>
          <button className="btn-ghost !px-2" onClick={onClose}>
            <Archive size={16} />
          </button>
        </div>

        <div className="mb-3 flex items-center justify-between gap-2 text-xs t3">
          <span className="min-w-0 truncate">《{title}》的每日自动备份与手动快照</span>
          <button className="btn-outline shrink-0 !py-1 !text-xs" disabled={busy} onClick={() => void backupNow()}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}
            立即备份
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-auto pr-1">
          {snapshots === null && <p className="py-8 text-center text-sm t3">读取中……</p>}
          {snapshots !== null && snapshots.length === 0 && (
            <p className="py-8 text-center text-sm t3">还没有快照。写一些正文后,应用每天会自动备份一次。</p>
          )}
          {snapshots !== null &&
            snapshots.map((s) => (
              <div
                key={s.name}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm"
                style={{ background: 'var(--panel-2)' }}
              >
                <div className="min-w-0 flex-1">
                  <div>{new Date(s.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                  <div className="text-xs t3">{s.chapterCount} 章</div>
                </div>
                <button
                  className="btn-outline shrink-0 !py-1 !text-xs"
                  disabled={busy}
                  title="恢复到该时点(当前内容会先自动备份)"
                  onClick={() => void restore(s.name)}
                >
                  <Undo2 size={12} />
                  恢复
                </button>
              </div>
            ))}
        </div>

        <p className="mt-4 text-xs t3">每本书保留最近 7 份自动快照;「恢复」会把当前内容先自动备份一份,可随时再恢复回来。</p>
      </div>
    </div>
  )
}
