import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import type { Character } from '@shared/types'

function CharacterCard({ character }: { character: Character }) {
  const updateCharacter = useStore((s) => s.updateCharacter)
  const removeCharacter = useStore((s) => s.removeCharacter)
  const updateBook = useStore((s) => s.updateBook)
  const [expanded, setExpanded] = useState(false)

  function persist() {
    const current = useStore.getState().book?.characters.find((c) => c.id === character.id)
    if (!current) return
    void updateBook((draft) => {
      const idx = draft.characters.findIndex((c) => c.id === character.id)
      if (idx >= 0) draft.characters[idx] = current
    })
  }

  return (
    <div className="soft-row mb-2 overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button className="rounded p-0.5 t3" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <input
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
          value={character.name}
          onChange={(e) => void updateCharacter(character.id, { name: e.target.value })}
          onBlur={persist}
          placeholder="姓名"
        />
        <button
          className="rounded p-1 t3 hover:text-[var(--danger)]"
          title="删除人物"
          onClick={() => {
            if (window.confirm(`删除人物「${character.name}」?`)) void removeCharacter(character.id)
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
      {expanded && (
        <div className="space-y-2 p-2.5" style={{ borderTop: '1px solid var(--border)' }}>
          <input
            className="field-input !py-1.5 !text-xs"
            value={character.role}
            onChange={(e) => void updateCharacter(character.id, { role: e.target.value })}
            onBlur={persist}
            placeholder="身份/定位"
          />
          <textarea
            className="field-input min-h-14 resize-y !py-1.5 !text-xs"
            value={character.personality}
            onChange={(e) => void updateCharacter(character.id, { personality: e.target.value })}
            onBlur={persist}
            placeholder="性格特点"
          />
          <textarea
            className="field-input min-h-12 resize-y !py-1.5 !text-xs"
            value={character.appearance ?? ''}
            onChange={(e) => void updateCharacter(character.id, { appearance: e.target.value })}
            onBlur={persist}
            placeholder="外貌特征"
          />
          <textarea
            className="field-input min-h-12 resize-y !py-1.5 !text-xs"
            value={character.abilities ?? ''}
            onChange={(e) => void updateCharacter(character.id, { abilities: e.target.value })}
            onBlur={persist}
            placeholder="能力/特长"
          />
          <textarea
            className="field-input min-h-12 resize-y !py-1.5 !text-xs"
            value={character.relations ?? ''}
            onChange={(e) => void updateCharacter(character.id, { relations: e.target.value })}
            onBlur={persist}
            placeholder="人物关系"
          />
          <textarea
            className="field-input min-h-14 resize-y !py-1.5 !text-xs"
            value={character.background}
            onChange={(e) => void updateCharacter(character.id, { background: e.target.value })}
            onBlur={persist}
            placeholder="背景来历"
          />
          <textarea
            className="field-input min-h-14 resize-y !py-1.5 !text-xs"
            value={character.arc}
            onChange={(e) => void updateCharacter(character.id, { arc: e.target.value })}
            onBlur={persist}
            placeholder="成长线/结局走向"
          />
          <textarea
            className="field-input min-h-10 resize-y !py-1.5 !text-xs"
            value={character.notes}
            onChange={(e) => void updateCharacter(character.id, { notes: e.target.value })}
            onBlur={persist}
            placeholder="备注(口头禅、标志性动作)"
          />
        </div>
      )}
    </div>
  )
}

/** 卡片头部动作区:AI 起名(下拉面板)+ 添加,由 CodexView 放进卡片标题行 */
export function CharacterActions() {
  const addCharacter = useStore((s) => s.addCharacter)
  const addCharacterNamed = useStore((s) => s.addCharacterNamed)
  const generateNames = useStore((s) => s.generateNames)
  const namingBusy = useStore((s) => s.namingBusy)
  const nameCandidates = useStore((s) => s.nameCandidates)
  const [open, setOpen] = useState(false)
  const [hint, setHint] = useState('')

  return (
    <div className="relative flex items-center gap-1.5">
      <button
        className={`btn-outline !h-8 !px-2.5 !text-xs ${open ? 'active' : ''}`}
        title="用 AI 生成角色名"
        onClick={() => setOpen(!open)}
      >
        <Sparkles size={13} />
        AI起名
      </button>
      <button className="btn-outline !h-8 !px-2.5 !text-xs" title="新建空白人物卡" onClick={() => void addCharacter()}>
        <Plus size={13} />
        添加
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="panel absolute right-0 top-9 z-20 w-64 space-y-2 p-2.5" style={{ boxShadow: 'var(--shadow-pop)' }}>
            <input
              className="field-input !py-1.5 !text-xs"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="角色定位,如:高冷女主"
            />
            <button
              className="btn-primary !h-8 w-full !text-xs"
              disabled={namingBusy}
              onClick={() => void generateNames(hint)}
            >
              {namingBusy ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  起名中…
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  生成 5 个候选名
                </>
              )}
            </button>
            {nameCandidates.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {nameCandidates.map((name) => (
                  <button
                    key={name}
                    className="btn-outline !h-7 !px-2 !text-[11px]"
                    title="用这个名字创建人物卡"
                    onClick={() => {
                      void addCharacterNamed(name, hint)
                      setOpen(false)
                    }}
                  >
                    {name}
                    <Plus size={10} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** 人物卡片列表主体:统计 + 搜索 + 列表(头部动作区见 CharacterActions) */
export default function CharacterPanel() {
  const book = useStore((s) => s.book)
  const [query, setQuery] = useState('')

  if (!book) return null

  /* 快速搜索:写文时按名字/定位查设定,不用翻页 */
  const q = query.trim()
  const list = q ? book.characters.filter((c) => c.name.includes(q) || c.role.includes(q)) : book.characters

  return (
    <div>
      <p className="mb-2 text-xs t3">共 {book.characters.length} 位人物,生成时自动注入</p>
      <input
        className="field-input mb-3 !py-1.5 !text-xs"
        placeholder="搜索人物名 / 定位"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {book.characters.length === 0 && (
        <div className="py-10 text-center text-xs t3">先给主角、女主、反派建卡,AI 写作人设不崩</div>
      )}
      {q && list.length === 0 && <div className="py-10 text-center text-xs t3">没有匹配「{q}」的人物</div>}
      {list.map((c) => (
        <CharacterCard key={c.id} character={c} />
      ))}
    </div>
  )
}
