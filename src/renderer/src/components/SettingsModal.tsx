import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { useStore } from '../store'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { AI_PRESETS, type AIProfile, type AISettings, type AppSettings } from '@shared/types'

export default function SettingsModal() {
  const open = useStore((s) => s.settingsOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const updateSettings = useStore((s) => s.updateSettings)
  const showToast = useStore((s) => s.showToast)

  const [draft, setDraft] = useState<AppSettings>(() => structuredClone(useStore.getState().settings))
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [showKey, setShowKey] = useState(false)

  /* 每次打开弹窗时同步最新配置 */
  useEffect(() => {
    if (open) {
      setDraft(structuredClone(useStore.getState().settings))
      setTestResult(null)
    }
  }, [open])

  /* 打开期间 Tab 只在弹窗内循环,关闭时焦点还给打开它的按钮 */
  const cardRef = useRef<HTMLDivElement>(null)
  useFocusTrap(cardRef, open)

  if (!open) return null

  const profile: AIProfile =
    draft.ai.profiles.find((p) => p.id === draft.ai.activeProfileId) ?? draft.ai.profiles[0]

  function patchAi(patch: Partial<AISettings>) {
    setDraft((d) => ({ ...d, ai: { ...d.ai, ...patch } }))
  }

  /** 修改当前正在编辑(即激活)的配置 */
  function patchProfile(patch: Partial<AIProfile>) {
    setDraft((d) => ({
      ...d,
      ai: {
        ...d.ai,
        profiles: d.ai.profiles.map((p) => (p.id === d.ai.activeProfileId ? { ...p, ...patch } : p))
      }
    }))
  }

  function addProfile() {
    const id = `profile-${Date.now()}`
    setDraft((d) => ({
      ...d,
      ai: {
        ...d.ai,
        profiles: [
          ...d.ai.profiles,
          { id, name: `配置${d.ai.profiles.length + 1}`, baseUrl: '', apiKey: '', model: '' }
        ],
        activeProfileId: id
      }
    }))
    setTestResult(null)
  }

  function removeProfile(id: string) {
    setDraft((d) => {
      if (d.ai.profiles.length <= 1) return d
      const profiles = d.ai.profiles.filter((p) => p.id !== id)
      const activeProfileId = d.ai.activeProfileId === id ? profiles[0].id : d.ai.activeProfileId
      return { ...d, ai: { ...d.ai, profiles, activeProfileId } }
    })
    setTestResult(null)
  }

  async function pickFolder() {
    const dir = await window.api.dialog.pickFolder()
    if (dir) setDraft((d) => ({ ...d, libraryRoot: dir }))
  }

  async function test() {
    setTesting(true)
    setTestResult(null)
    /* 先把当前草稿存进去,让主进程拿到最新配置 */
    await useStore.getState().updateSettings(draft)
    const result = await window.api.ai.test()
    setTestResult(result)
    setTesting(false)
  }

  async function save() {
    await updateSettings(draft)
    setSettingsOpen(false)
    showToast('设置已保存')
  }

  const matchedPreset = AI_PRESETS.find((p) => p.baseUrl && p.baseUrl === profile.baseUrl)
  const keyHint = matchedPreset?.keyHint ?? AI_PRESETS[0].keyHint

  return (
    <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
      <div
        ref={cardRef}
        tabIndex={-1}
        className="modal-card flex max-h-[90vh] w-full max-w-xl flex-col p-6 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="serif text-lg font-semibold tracking-wide">设 置</h2>
          <button className="btn-ghost !px-2" onClick={() => setSettingsOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-auto pr-1">
          {/* AI 模型 */}
          <section>
            <h3 className="serif mb-2 text-sm font-semibold tracking-wider">AI 模型配置</h3>

            {/* 配置列表:点谁用谁 */}
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {draft.ai.profiles.map((p) => (
                <span
                  key={p.id}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                    p.id === draft.ai.activeProfileId
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                      : 'border-[var(--border-strong)] bg-[var(--panel)] text-[var(--t2)] hover:bg-[var(--panel-2)]'
                  }`}
                >
                  <button onClick={() => patchAi({ activeProfileId: p.id })} title="点击启用此配置">
                    {p.name || p.model || '未命名'}
                  </button>
                  {draft.ai.profiles.length > 1 && (
                    <button
                      className="t3 hover:text-[var(--danger)]"
                      title="删除此配置"
                      onClick={() => removeProfile(p.id)}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </span>
              ))}
              <button className="btn-ghost !px-2 !py-1 !text-xs" title="新增一个自定义配置" onClick={addProfile}>
                <Plus size={13} />
                新增
              </button>
            </div>

            {/* 模板快填 */}
            <div className="mb-3">
              <label className="field-label">从模板快速填充(仅填入下方表单,可继续修改)</label>
              <div className="flex flex-wrap gap-1.5">
                {AI_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className="btn-outline !px-2.5 !py-1 !text-xs"
                    onClick={() =>
                      patchProfile({
                        ...(preset.id === 'custom' ? {} : { name: preset.label }),
                        baseUrl: preset.baseUrl,
                        model: preset.model
                      })
                    }
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] t3">{keyHint}</p>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">配置名称</label>
                  <input
                    className="field-input"
                    value={profile.name}
                    onChange={(e) => patchProfile({ name: e.target.value })}
                    placeholder="如:我的中转站"
                  />
                </div>
                <div>
                  <label className="field-label">模型名称</label>
                  <input
                    className="field-input"
                    value={profile.model}
                    onChange={(e) => patchProfile({ model: e.target.value })}
                    placeholder="如 deepseek-chat / glm-4-flash"
                  />
                </div>
              </div>
              <div>
                <label className="field-label">API 地址(Base URL,兼容 OpenAI /chat/completions)</label>
                <input
                  className="field-input"
                  value={profile.baseUrl}
                  onChange={(e) => patchProfile({ baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                />
              </div>
              <div>
                <label className="field-label">API Key(本地 / 部分中转服务可留空)</label>
                <div className="relative">
                  <input
                    className="field-input pr-14"
                    type={showKey ? 'text' : 'password'}
                    value={profile.apiKey}
                    onChange={(e) => patchProfile({ apiKey: e.target.value })}
                    placeholder="sk-…"
                  />
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs t3 hover:text-[var(--text)]"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? '隐藏' : '显示'}
                  </button>
                </div>
              </div>
              <div>
                <label className="field-label">本配置单次生成上限(tokens)</label>
                <input
                  type="number"
                  className="field-input"
                  value={profile.maxTokens ?? ''}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    patchProfile(isNaN(v) || v <= 0 ? { maxTokens: undefined } : { maxTokens: v })
                  }}
                  placeholder={`留空使用全局设置(${draft.ai.maxTokens});推理模型建议 16384`}
                />
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-outline" disabled={testing} onClick={() => void test()}>
                  {testing ? '测试中…' : '测试当前配置'}
                </button>
                {testResult && (
                  <span className={`text-xs ${testResult.ok ? 'ok' : 'danger'}`}>
                    {testResult.message}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <label className="field-label">温度 {draft.ai.temperature}</label>
                <input
                  type="range"
                  min="0.1"
                  max="1.5"
                  step="0.1"
                  className="w-full accent-[var(--accent)]"
                  value={draft.ai.temperature}
                  onChange={(e) => patchAi({ temperature: parseFloat(e.target.value) })}
                />
                <p className="mt-0.5 text-[10px] t3">低=稳,高=野(所有配置共用)</p>
              </div>
              <div>
                <label className="field-label">单次生成上限</label>
                <input
                  type="number"
                  className="field-input"
                  value={draft.ai.maxTokens}
                  onChange={(e) => patchAi({ maxTokens: parseInt(e.target.value, 10) || 4096 })}
                />
                <p className="mt-0.5 text-[10px] t3">tokens,建议 ≥ 4096</p>
              </div>
              <div>
                <label className="field-label">上下文预算</label>
                <input
                  type="number"
                  className="field-input"
                  value={draft.ai.contextBudgetChars}
                  onChange={(e) => patchAi({ contextBudgetChars: parseInt(e.target.value, 10) || 12000 })}
                />
                <p className="mt-0.5 text-[10px] t3">字符,含设定+前情</p>
              </div>
            </div>
          </section>

          {/* 风格 */}
          <section>
            <h3 className="serif mb-2 text-sm font-semibold tracking-wider">写作风格</h3>
            <p className="text-xs t3">风格指令按书独立保存。打开书籍后,在右侧「大纲」面板顶部即可编辑。</p>
          </section>

          {/* 设定自动入库 */}
          <section>
            <h3 className="serif mb-2 text-sm font-semibold tracking-wider">设定自动入库</h3>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                checked={draft.autoScan}
                onChange={(e) => setDraft((d) => ({ ...d, autoScan: e.target.checked }))}
              />
              <span>
                生成前情摘要时,自动检测并写入本章新设定
                <span className="mt-0.5 block text-xs leading-relaxed t3">
                  逐段扫描本章正文,把新人物、新物品、新境界、世界观补充直接存进设定中心,按名称去重不覆盖已有条目。自动连写时每章都会执行一次,会额外消耗 token;关闭后仍可手动用「本章提取」。
                </span>
              </span>
            </label>
          </section>

          {/* 书库 */}
          <section>
            <h3 className="serif mb-2 text-sm font-semibold tracking-wider">书库</h3>
            <label className="field-label">书籍存储目录(改动后回到书库页刷新可见)</label>
            <div className="flex gap-2">
              <input
                className="field-input"
                value={draft.libraryRoot}
                onChange={(e) => setDraft((d) => ({ ...d, libraryRoot: e.target.value }))}
                placeholder="留空则使用 文档/AINovelStudio"
              />
              <button className="btn-outline shrink-0" onClick={() => void pickFolder()}>
                选择
              </button>
            </div>
          </section>

          {/* 外观 */}
          <section>
            <h3 className="serif mb-2 text-sm font-semibold tracking-wider">外观</h3>
            <div className="flex gap-2">
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  className={`btn-outline !px-3 !py-1 !text-xs ${draft.theme === t ? 'active' : ''}`}
                  onClick={() => setDraft((d) => ({ ...d, theme: t }))}
                >
                  {t === 'light' ? '浅色' : '深色'}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-[var(--border)] pt-4">
          <button className="btn-outline" onClick={() => setSettingsOpen(false)}>
            取消
          </button>
          <button className="btn-primary" onClick={() => void save()}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
