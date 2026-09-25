import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useStore, uid } from '../store'

export default function WorldviewPanel() {
  const book = useStore((s) => s.book)
  const updateWorldview = useStore((s) => s.updateWorldview)
  const updateBook = useStore((s) => s.updateBook)
  const [newForeshadow, setNewForeshadow] = useState('')

  /* 卸载时把未持久化的设定写盘 */
  useEffect(() => {
    return () => {
      const state = useStore.getState()
      if (!state.book) return
      void state.updateBook(() => undefined)
    }
  }, [])

  if (!book) return null
  const w = book.worldview
  const foreshadows = w.foreshadows ?? []

  function addForeshadow(): void {
    const text = newForeshadow.trim()
    if (!text) return
    setNewForeshadow('')
    updateWorldview({ foreshadows: [...foreshadows, { id: uid(), text, resolved: false }] })
    void updateBook(() => undefined)
  }

  function toggleForeshadow(id: string): void {
    updateWorldview({ foreshadows: foreshadows.map((f) => (f.id === id ? { ...f, resolved: !f.resolved } : f)) })
    void updateBook(() => undefined)
  }

  function removeForeshadow(id: string): void {
    updateWorldview({ foreshadows: foreshadows.filter((f) => f.id !== id) })
    void updateBook(() => undefined)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs t3">每次 AI 生成都会注入这些设定</p>
      {(
        [
          { key: 'setting', label: '世界背景', placeholder: '朝代格局、社会规则、关键历史' },
          { key: 'powerSystem', label: '力量 / 等级体系', placeholder: '如:炼气→筑基→金丹→元婴' },
          { key: 'goldenFinger', label: '金手指(主角外挂)', placeholder: '规则、能力边界、升级条件' },
          { key: 'factions', label: '势力与阵营', placeholder: '宗门、家族及相互关系' },
          { key: 'notes', label: '其他设定', placeholder: '世界观补充' }
        ] as const
      ).map(({ key, label, placeholder }) => (
        <div key={key}>
          <label className="field-label">{label}</label>
          <textarea
            className="field-input min-h-20 resize-y !py-2.5"
            value={w[key]}
            placeholder={placeholder}
            onChange={(e) => updateWorldview({ [key]: e.target.value })}
            onBlur={() => void updateBook(() => undefined)}
          />
        </div>
      ))}

      {/* 伏笔清单:逐条记录,标记已回收/待回收,避免挖坑不填 */}
      <div>
        <label className="field-label">伏笔清单({foreshadows.filter((f) => !f.resolved).length} 条待回收)</label>
        <div className="space-y-1.5">
          {foreshadows.map((f) => (
            <div key={f.id} className="soft-row flex items-center gap-1.5 px-2.5 py-1.5 text-xs">
              <button
                className={`h-3.5 w-3.5 shrink-0 rounded-full border transition ${f.resolved ? '' : 'hover:scale-110'}`}
                style={{
                  background: f.resolved ? 'var(--ok)' : 'transparent',
                  borderColor: f.resolved ? 'var(--ok)' : 'var(--border-strong)',
                  boxShadow: f.resolved ? '0 0 8px -2px color-mix(in srgb, var(--ok) 60%, transparent)' : 'none'
                }}
                title={f.resolved ? '已回收,点击改回待回收' : '待回收,点击标记已回收'}
                onClick={() => toggleForeshadow(f.id)}
              />
              <span className={`min-w-0 flex-1 ${f.resolved ? 't3 line-through' : 't2'}`}>{f.text}</span>
              <span className="shrink-0 text-[11px]" style={{ color: f.resolved ? 'var(--ok)' : 'var(--warn)' }}>
                {f.resolved ? '已回收' : '待回收'}
              </span>
              <button
                className="shrink-0 t3 hover:text-[var(--danger)]"
                title="删除这条伏笔"
                onClick={() => removeForeshadow(f.id)}
              >
                <span aria-hidden>×</span>
              </button>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <input
            className="field-input !py-1.5 !text-xs"
            placeholder="新增伏笔,如:断剑的来历"
            value={newForeshadow}
            onChange={(e) => setNewForeshadow(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addForeshadow()
            }}
          />
          <button className="btn-outline !h-8 !w-8 shrink-0 !px-0" title="添加伏笔(Enter)" onClick={addForeshadow}>
            <Plus size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
