import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { ITEM_CATEGORIES, type ItemEntry } from '@shared/types'

function CategoryInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      className="field-input !py-1.5 !text-xs"
      list="item-category-options"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="类别(武器/丹药/阵法…)"
    />
  )
}

function ItemCard({ item }: { item: ItemEntry }) {
  const updateItem = useStore((s) => s.updateItem)
  const removeItem = useStore((s) => s.removeItem)
  const updateBook = useStore((s) => s.updateBook)
  const [expanded, setExpanded] = useState(false)

  function persist() {
    const current = useStore.getState().book?.items.find((it) => it.id === item.id)
    if (!current) return
    void updateBook((draft) => {
      const idx = draft.items.findIndex((it) => it.id === item.id)
      if (idx >= 0) draft.items[idx] = current
    })
  }

  const subtitle = [item.category, item.grade].filter(Boolean).join(' · ')

  return (
    <div className="panel card-lift mb-2 overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button className="rounded p-0.5 t3" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <input
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
          value={item.name}
          onChange={(e) => updateItem(item.id, { name: e.target.value })}
          onBlur={persist}
          placeholder="名称"
        />
        {subtitle && <span className="shrink-0 text-[11px] t3">{subtitle}</span>}
        <button
          className="shrink-0 rounded p-1 t3 hover:text-[var(--danger)]"
          title="删除物品"
          onClick={() => {
            if (window.confirm(`删除物品「${item.name}」?`)) void removeItem(item.id)
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
      {expanded && (
        <div className="space-y-2 p-2.5" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="grid grid-cols-2 gap-2">
            <CategoryInput value={item.category} onChange={(v) => updateItem(item.id, { category: v })} />
            <input
              className="field-input !py-1.5 !text-xs"
              value={item.grade}
              onChange={(e) => updateItem(item.id, { grade: e.target.value })}
              onBlur={persist}
              placeholder="品级(如:三阶 / 圣器)"
            />
          </div>
          <input
            className="field-input !py-1.5 !text-xs"
            value={item.owner}
            onChange={(e) => updateItem(item.id, { owner: e.target.value })}
            onBlur={persist}
            placeholder="当前持有者(角色名)"
          />
          <textarea
            className="field-input min-h-12 resize-y !py-1.5 !text-xs"
            value={item.appearance}
            onChange={(e) => updateItem(item.id, { appearance: e.target.value })}
            onBlur={persist}
            placeholder="外观描述"
          />
          <textarea
            className="field-input min-h-12 resize-y !py-1.5 !text-xs"
            value={item.effect}
            onChange={(e) => updateItem(item.id, { effect: e.target.value })}
            onBlur={persist}
            placeholder="能力 / 效果"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="field-input !py-1.5 !text-xs"
              value={item.origin}
              onChange={(e) => updateItem(item.id, { origin: e.target.value })}
              onBlur={persist}
              placeholder="获取方式(炼制/掉落/传承…)"
            />
            <input
              className="field-input !py-1.5 !text-xs"
              value={item.location}
              onChange={(e) => updateItem(item.id, { location: e.target.value })}
              onBlur={persist}
              placeholder="获取地点"
            />
          </div>
          <input
            className="field-input !py-1.5 !text-xs"
            value={item.stage}
            onChange={(e) => updateItem(item.id, { stage: e.target.value })}
            onBlur={persist}
            placeholder="阶段记录(哪一卷/哪一章获得或消耗)"
          />
          <textarea
            className="field-input min-h-10 resize-y !py-1.5 !text-xs"
            value={item.notes}
            onChange={(e) => updateItem(item.id, { notes: e.target.value })}
            onBlur={persist}
            placeholder="备注(升级路线、伏笔等)"
          />
        </div>
      )}
    </div>
  )
}

export default function ItemPanel() {
  const book = useStore((s) => s.book)
  const chapter = useStore((s) => s.chapter)
  const addItem = useStore((s) => s.addItem)
  const generateItem = useStore((s) => s.generateItem)
  const extractItemsFromChapter = useStore((s) => s.extractItemsFromChapter)
  const itemBusy = useStore((s) => s.itemBusy)
  const extractBusy = useStore((s) => s.extractBusy)
  const [genOpen, setGenOpen] = useState(false)
  const [category, setCategory] = useState('')
  const [hint, setHint] = useState('')
  const [query, setQuery] = useState('')

  if (!book) return null

  /* 快速搜索:名称/类别/品级/持有者/效果任一命中 */
  const q = query.trim()
  const list = q
    ? book.items.filter((it) => [it.name, it.category, it.grade, it.owner, it.effect].some((v) => v.includes(q)))
    : book.items

  return (
    <div>
      <datalist id="item-category-options">
        {ITEM_CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="mb-2 flex items-center justify-between gap-1">
        <p className="text-xs t3">物品图鉴 · {book.items.length} 件,生成时自动注入</p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            className={`btn-outline !px-2 !py-1 !text-xs ${genOpen ? 'active' : ''}`}
            onClick={() => setGenOpen(!genOpen)}
            title="用 AI 生成一张物品卡"
          >
            <Sparkles size={13} />
            AI生成
          </button>
          <button
            className="btn-outline !px-2 !py-1 !text-xs"
            disabled={extractBusy || !chapter?.content.trim()}
            title={chapter?.content.trim() ? '从本章正文提取新物品并建卡' : '先写点本章内容'}
            onClick={() => void extractItemsFromChapter()}
          >
            {extractBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            本章提取
          </button>
          <button className="btn-secondary !px-2 !py-1 !text-xs" onClick={() => void addItem()} title="手动新增空白物品卡">
            <Plus size={13} />
          </button>
        </div>
      </div>

      <input
        className="field-input mb-2 !py-1.5 !text-xs"
        placeholder="搜索物品:名称 / 类别 / 品级 / 持有者"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {genOpen && (
        <div className="panel mb-2 space-y-2 p-2.5">
          <CategoryInput value={category} onChange={setCategory} />
          <input
            className="field-input !py-1.5 !text-xs"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="一句话想法,如:主角前期佩剑,后期可升级"
          />
          <button
            className="btn-primary w-full !py-1.5 !text-xs"
            disabled={itemBusy}
            onClick={() => void generateItem(category, hint)}
          >
            {itemBusy ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                生成中…
              </>
            ) : (
              <>
                <Sparkles size={13} />
                生成物品卡
              </>
            )}
          </button>
        </div>
      )}

      {book.items.length === 0 && (
        <div className="panel p-4 text-center text-xs t3">
          把武器、丹药、阵法等重要物品记成卡片,生成正文时名称、品级不会写崩;写完一章点「本章提取」自动归档
        </div>
      )}
      {q && list.length === 0 && <div className="panel p-4 text-center text-xs t3">没有匹配「{q}」的物品</div>}
      {list.map((it) => (
        <ItemCard key={it.id} item={it} />
      ))}
    </div>
  )
}
