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
              placeholder="品级"
            />
          </div>
          <input
            className="field-input !py-1.5 !text-xs"
            value={item.owner}
            onChange={(e) => updateItem(item.id, { owner: e.target.value })}
            onBlur={persist}
            placeholder="当前持有者"
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
              placeholder="获取方式"
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
            placeholder="阶段记录(哪一章获得/消耗)"
          />
          <textarea
            className="field-input min-h-10 resize-y !py-1.5 !text-xs"
            value={item.notes}
            onChange={(e) => updateItem(item.id, { notes: e.target.value })}
            onBlur={persist}
            placeholder="备注(升级路线、伏笔)"
          />
        </div>
      )}
    </div>
  )
}

/** 卡片头部动作区:AI 生成(下拉面板)+ 本章提取 + 新增,由 CodexView 放进卡片标题行 */
export function ItemActions() {
  const addItem = useStore((s) => s.addItem)
  const generateItem = useStore((s) => s.generateItem)
  const extractItemsFromChapter = useStore((s) => s.extractItemsFromChapter)
  const itemBusy = useStore((s) => s.itemBusy)
  const extractBusy = useStore((s) => s.extractBusy)
  const chapter = useStore((s) => s.chapter)
  const [genOpen, setGenOpen] = useState(false)
  const [category, setCategory] = useState('')
  const [hint, setHint] = useState('')

  return (
    <div className="relative flex items-center gap-1.5">
      <button
        className={`btn-outline !h-8 !px-2.5 !text-xs ${genOpen ? 'active' : ''}`}
        title="用 AI 生成一张物品卡"
        onClick={() => setGenOpen(!genOpen)}
      >
        <Sparkles size={13} />
        AI生成
      </button>
      <button
        className="btn-outline !h-8 !px-2.5 !text-xs"
        disabled={extractBusy || !chapter?.content.trim()}
        title={chapter?.content.trim() ? '从本章正文提取新物品并建卡' : '先写点本章内容'}
        onClick={() => void extractItemsFromChapter()}
      >
        {extractBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        本章提取
      </button>
      <button className="btn-outline !h-8 !w-8 !px-0" title="手动新增空白物品卡" onClick={() => void addItem()}>
        <Plus size={13} />
      </button>
      {genOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setGenOpen(false)} />
          <div className="panel absolute right-0 top-9 z-20 w-64 space-y-2 p-2.5" style={{ boxShadow: 'var(--shadow)' }}>
            <datalist id="item-category-options">
              {ITEM_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <CategoryInput value={category} onChange={setCategory} />
            <input
              className="field-input !py-1.5 !text-xs"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="一句话想法,如:可升级的佩剑"
            />
            <button
              className="btn-primary !h-8 w-full !text-xs"
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
        </>
      )}
    </div>
  )
}

/** 物品卡片列表主体:统计 + 搜索 + 列表(头部动作区见 ItemActions) */
export default function ItemPanel() {
  const book = useStore((s) => s.book)
  const [query, setQuery] = useState('')

  if (!book) return null

  /* 快速搜索:名称/类别/品级/持有者/效果任一命中 */
  const q = query.trim()
  const list = q
    ? book.items.filter((it) => [it.name, it.category, it.grade, it.owner, it.effect].some((v) => v.includes(q)))
    : book.items

  return (
    <div>
      <p className="mb-2 text-xs t3">共 {book.items.length} 件,生成时自动注入</p>
      <input
        className="field-input mb-3 !py-1.5 !text-xs"
        placeholder="搜索物品:名称 / 类别 / 品级 / 持有者"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {book.items.length === 0 && (
        <div className="py-10 text-center text-xs t3">把重要物品记成卡片,名称品级不会写崩</div>
      )}
      {q && list.length === 0 && <div className="py-10 text-center text-xs t3">没有匹配「{q}」的物品</div>}
      {list.map((it) => (
        <ItemCard key={it.id} item={it} />
      ))}
    </div>
  )
}
