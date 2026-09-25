import { X } from 'lucide-react'
import { useMemo } from 'react'
import { readHeatmap } from '../heatmap'

/** GitHub 风格码字热力图:展示最近 53 周的按日写字量 */
export default function HeatmapModal({
  bookId,
  title,
  onClose
}: {
  bookId: string
  title: string
  onClose: () => void
}) {
  const daily = useMemo(() => readHeatmap(bookId), [bookId])

  const weeks = useMemo(() => {
    const cells: { date: string; count: number }[][] = []
    const end = new Date()
    /* 回溯到 371 天前,再对齐到该周的周日,凑整列 */
    const start = new Date(end)
    start.setDate(start.getDate() - 370)
    start.setDate(start.getDate() - start.getDay())
    const fmt = (d: Date): string => d.toLocaleDateString('sv-CN')
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const date = fmt(d)
      const count = daily[date] ?? 0
      if (cells.length === 0 || cells[cells.length - 1].length === 7) cells.push([])
      cells[cells.length - 1].push({ date, count })
    }
    return cells
  }, [daily])

  const totalDays = weeks.flat().filter((c) => c.count > 0).length
  const totalWords = weeks.flat().reduce((s, c) => s + c.count, 0)
  const max = Math.max(1, ...weeks.flat().map((c) => c.count))

  const levelColor = (count: number): string => {
    if (count <= 0) return 'var(--panel-2)'
    const ratio = count / max
    const pct = ratio > 0.75 ? 100 : ratio > 0.5 ? 70 : ratio > 0.25 ? 45 : 25
    return `color-mix(in srgb, var(--accent) ${pct}%, var(--panel-2))`
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card fade-up w-full max-w-3xl p-6 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="serif text-lg font-semibold tracking-wide">码字热力图</h2>
            <p className="mt-0.5 text-xs t3">
              《{title}》· 近一年有 {totalDays} 天在写,共 {totalWords.toLocaleString('zh-CN')} 字
            </p>
          </div>
          <button className="btn-ghost !px-2" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-[3px] overflow-x-auto pb-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((cell) => (
                <div
                  key={cell.date}
                  className="h-[11px] w-[11px] rounded-[3px] transition hover:scale-125"
                  style={{ background: levelColor(cell.count) }}
                  title={`${cell.date} · ${cell.count > 0 ? cell.count.toLocaleString('zh-CN') + ' 字' : '未动笔'}`}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] t3">
          少
          {[25, 45, 70, 100].map((pct) => (
            <span
              key={pct}
              className="h-[11px] w-[11px] rounded-[3px]"
              style={{ background: `color-mix(in srgb, var(--accent) ${pct}%, var(--panel-2))` }}
            />
          ))}
          多
        </div>
      </div>
    </div>
  )
}
