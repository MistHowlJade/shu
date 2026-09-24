import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import type { Character } from '@shared/types'

function CharacterCard({ character }: { character: Character }) {
  const updateCharacter = useStore((s) => s.updateCharacter)
  const removeCharacter = useStore((s) => s.removeCharacter)
  const updateBook = useStore((s) => s.updateBook)
  const book = useStore((s) => s.book)
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
    <div className="panel mb-2 overflow-hidden">
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
            placeholder="身份/定位(主角、反派、红颜、师父……)"
          />
          <textarea
            className="field-input min-h-14 resize-y !py-1.5 !text-xs"
            value={character.personality}
            onChange={(e) => void updateCharacter(character.id, { personality: e.target.value })}
            onBlur={persist}
            placeholder="性格特点(如:腹黑毒舌,护短,睚眦必报)"
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
            placeholder="备注(口头禅、标志性动作等)"
          />
        </div>
      )}
    </div>
  )
}

export default function CharacterPanel() {
  const book = useStore((s) => s.book)
  const addCharacter = useStore((s) => s.addCharacter)
  const addCharacterNamed = useStore((s) => s.addCharacterNamed)
  const generateNames = useStore((s) => s.generateNames)
  const namingBusy = useStore((s) => s.namingBusy)
  const nameCandidates = useStore((s) => s.nameCandidates)
  const [namingOpen, setNamingOpen] = useState(false)
  const [nameHint, setNameHint] = useState('')

  if (!book) return null
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-1">
        <p className="text-xs t3">共 {book.characters.length} 位人物,生成时自动注入</p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            className={`btn-outline !px-2 !py-1 !text-xs ${namingOpen ? 'active' : ''}`}
            onClick={() => setNamingOpen(!namingOpen)}
            title="用 AI 生成角色名"
          >
            <Sparkles size={13} />
            AI起名
          </button>
          <button className="btn-secondary !px-2 !py-1 !text-xs" onClick={() => void addCharacter()}>
            <Plus size={13} />
            添加
          </button>
        </div>
      </div>

      {namingOpen && (
        <div className="panel mb-2 space-y-2 p-2.5">
          <input
            className="field-input !py-1.5 !text-xs"
            value={nameHint}
            onChange={(e) => setNameHint(e.target.value)}
            placeholder="角色定位,如:高冷女主 / 搞笑师尊 / 反派大师兄"
          />
          <button
            className="btn-primary w-full !py-1.5 !text-xs"
            disabled={namingBusy}
            onClick={() => void generateNames(nameHint)}
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
                  className="btn-outline !px-2 !py-1 !text-xs"
                  title="用这个名字创建人物卡"
                  onClick={() => void addCharacterNamed(name, nameHint)}
                >
                  {name}
                  <Plus size={11} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {book.characters.length === 0 && (
        <div className="panel p-4 text-center text-xs t3">
          先把主角、女主、反派等核心人物建好卡,AI 写作时人设不会崩
        </div>
      )}
      {book.characters.map((c) => (
        <CharacterCard key={c.id} character={c} />
      ))}
    </div>
  )
}
