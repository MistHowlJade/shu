import { useEffect } from 'react'
import { useStore } from '../store'

export default function WorldviewPanel() {
  const book = useStore((s) => s.book)
  const updateWorldview = useStore((s) => s.updateWorldview)
  const updateBook = useStore((s) => s.updateBook)

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

  return (
    <div className="space-y-3">
      <p className="text-xs t3">这些设定会在每次 AI 生成时注入上下文,越具体越不容易崩</p>
      {(
        [
          { key: 'setting', label: '世界背景', placeholder: '朝代/大陆格局、社会规则、重要历史事件……' },
          { key: 'powerSystem', label: '力量 / 等级体系', placeholder: '如:炼气→筑基→金丹→元婴→化神……每一级的能力差异' },
          { key: 'goldenFinger', label: '金手指(主角外挂)', placeholder: '系统的规则、能力边界、升级条件,越清楚 AI 越不会写崩' },
          { key: 'factions', label: '势力与阵营', placeholder: '家族、宗门、公司、神秘组织及相互关系' },
          { key: 'notes', label: '其他设定 / 伏笔清单', placeholder: '世界观补充、已埋伏笔记录……' }
        ] as const
      ).map(({ key, label, placeholder }) => (
        <div key={key}>
          <label className="field-label">{label}</label>
          <textarea
            className="field-input min-h-20 resize-y"
            value={w[key]}
            placeholder={placeholder}
            onChange={(e) => updateWorldview({ [key]: e.target.value })}
            onBlur={() => void updateBook(() => undefined)}
          />
        </div>
      ))}
    </div>
  )
}
