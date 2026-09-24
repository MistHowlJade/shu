import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Clipboard, Copy, CornerDownLeft, Eraser, Highlighter, Loader2, MessageCircle, RefreshCw, Send, Settings, Square, Users, Wand2 } from 'lucide-react'
import { totalWords, useStore } from '../store'
import { activeProfile } from '@shared/types'
import type { GenerateKind } from '@shared/types'

const KIND_LABEL: Record<GenerateKind, string> = {
  chapter: '整章初稿',
  continue: '续写',
  polish: '润色',
  outline: '细纲',
  summary: '前情摘要'
}

/** 灵感模式的开局提问(点击即发送) */
const QUICK_ASKS = [
  '接下来主角该怎么翻盘?',
  '这里给个什么爽点好?',
  '帮我琢磨一个反转',
  '这段对话怎么写才有张力?'
]

export default function AIPanel() {
  const book = useStore((s) => s.book)
  const chapter = useStore((s) => s.chapter)
  const aiRunning = useStore((s) => s.aiRunning)
  const aiOutput = useStore((s) => s.aiOutput)
  const aiError = useStore((s) => s.aiError)
  const aiIntent = useStore((s) => s.aiIntent)
  const aiLastKind = useStore((s) => s.aiLastKind)
  const selection = useStore((s) => s.selection)
  const content = useStore((s) => s.content)
  const settings = useStore((s) => s.settings)
  const autoWrite = useStore((s) => s.autoWrite)
  const inspire = useStore((s) => s.inspire)
  const setAiIntent = useStore((s) => s.setAiIntent)
  const runGenerate = useStore((s) => s.runGenerate)
  const stopGenerate = useStore((s) => s.stopGenerate)
  const appendOutputToContent = useStore((s) => s.appendOutputToContent)
  const insertOutputAtCursor = useStore((s) => s.insertOutputAtCursor)
  const replaceChapterWithOutput = useStore((s) => s.replaceChapterWithOutput)
  const replaceSelectionWithOutput = useStore((s) => s.replaceSelectionWithOutput)
  const applyOutputToOutline = useStore((s) => s.applyOutputToOutline)
  const copyOutput = useStore((s) => s.copyOutput)
  const clearAiOutput = useStore((s) => s.clearAiOutput)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const setWorkspaceMode = useStore((s) => s.setWorkspaceMode)
  const updateSettings = useStore((s) => s.updateSettings)
  const runAutoWrite = useStore((s) => s.runAutoWrite)
  const stopAutoWrite = useStore((s) => s.stopAutoWrite)
  const sendInspire = useStore((s) => s.sendInspire)
  const stopInspire = useStore((s) => s.stopInspire)
  const clearInspire = useStore((s) => s.clearInspire)
  const insertInspire = useStore((s) => s.insertInspire)
  const showToast = useStore((s) => s.showToast)

  const [tab, setTab] = useState<'gen' | 'chat'>(() =>
    localStorage.getItem('aiPanelTab') === 'chat' ? 'chat' : 'gen'
  )
  const [ask, setAsk] = useState('')
  const [autoCount, setAutoCount] = useState(3)
  /* 前情摘要属低频操作,默认折叠减少界面静态信息 */
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [profileMenu, setProfileMenu] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  /* 新消息/流式输出时,对话区自动滚到底 */
  useEffect(() => {
    const el = chatScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [inspire.msgs.length, inspire.stream])

  const disabled = !chapter || aiRunning || inspire.busy
  const hasSelection = !!selection && selection.end > selection.start
  const profile = activeProfile(settings.ai)
  const needsApiKey =
    !profile.apiKey.trim() && !profile.baseUrl.includes('localhost') && !profile.baseUrl.includes('127.0.0.1')

  const ACTIONS: { label: string; run: () => void; show: boolean }[] = [
    { label: '插入到光标处', run: () => void insertOutputAtCursor(), show: aiLastKind === 'continue' },
    { label: '追加到正文末尾', run: () => void appendOutputToContent(), show: aiLastKind === 'chapter' || aiLastKind === 'polish' },
    { label: '替换整章正文', run: () => void replaceChapterWithOutput(), show: aiLastKind === 'chapter' },
    { label: '替换选中内容', run: () => void replaceSelectionWithOutput(), show: aiLastKind === 'polish' },
    { label: '设为本章细纲', run: () => void applyOutputToOutline('set'), show: aiLastKind === 'outline' },
    { label: '追加到细纲', run: () => void applyOutputToOutline('append'), show: aiLastKind === 'outline' }
  ].filter((a) => a.show)

  function submitAsk(text?: string): void {
    const t = (text ?? ask).trim()
    /* 两种忙态都不能发;不能清空输入,否则正文生成中一回车就把问题弄丢 */
    if (!t || inspire.busy || aiRunning) return
    setAsk('')
    void sendInspire(t)
  }

  async function copyInspireText(text: string): Promise<void> {
    await navigator.clipboard.writeText(text)
    showToast('已复制')
  }

  function tabBtn(id: 'gen' | 'chat', label: string, Icon: typeof Wand2): React.ReactNode {
    const active = tab === id
    return (
      <button
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition ${active ? '' : 't3 hover:text-[var(--text)]'}`}
        style={active ? { background: 'var(--panel)', color: 'var(--accent)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : undefined}
        onClick={() => {
          setTab(id)
          localStorage.setItem('aiPanelTab', id)
        }}
      >
        <Icon size={13} />
        {label}
        {id === 'chat' && inspire.busy && (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--accent)' }} />
        )}
      </button>
    )
  }

  return (
    <div
      className="flex h-full flex-col overflow-auto p-4 pr-10"
      style={{ background: 'var(--panel)', borderLeft: '1px solid var(--border)' }}
    >
      {/* 模块 1:标题区(14px 加粗;模型名下拉即时切换,右侧入口进设置管理) */}
      <div className="mb-3 flex items-center gap-2">
        <span className="serif text-sm font-bold tracking-[0.2em]">AI 助 手</span>
        <div className="relative min-w-0">
          <button
            className="flex min-w-0 items-center gap-1 text-xs font-medium accent"
            title="切换模型配置(选择后即时生效)"
            onClick={() => setProfileMenu((v) => !v)}
          >
            <span className="truncate">{profile.name || profile.model || '未配置'}</span>
            <ChevronDown size={12} className="shrink-0" />
          </button>
          {profileMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setProfileMenu(false)} />
              <div className="panel absolute left-0 top-6 z-20 w-56 p-1" style={{ boxShadow: 'var(--shadow)' }}>
                {settings.ai.profiles.map((p) => (
                  <button
                    key={p.id}
                    className="palette-item"
                    data-active={p.id === settings.ai.activeProfileId}
                    onClick={() => {
                      void updateSettings({ ai: { ...settings.ai, activeProfileId: p.id } })
                      setProfileMenu(false)
                      showToast(`已切换到「${p.name}」`)
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="shrink-0 text-[11px] t3">{p.model}</span>
                  </button>
                ))}
                <button
                  className="palette-item"
                  onClick={() => {
                    setProfileMenu(false)
                    setSettingsOpen(true)
                  }}
                >
                  <Settings size={14} />
                  管理配置…
                </button>
              </div>
            </>
          )}
        </div>
        <button
          className="ml-auto shrink-0 text-xs t3 transition hover:text-[var(--text)]"
          onClick={() => setSettingsOpen(true)}
        >
          设置
        </button>
      </div>

      {needsApiKey && (
        <div
          className="mb-3 rounded-lg p-3 text-xs leading-relaxed"
          style={{
            background: 'color-mix(in srgb, var(--warn) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--warn) 40%, transparent)',
            color: 'var(--warn)'
          }}
        >
          当前配置还没有填 API Key:到
          <button className="mx-1 font-semibold underline" onClick={() => setSettingsOpen(true)}>
            设置
          </button>
          里补全,或新增一个自定义配置(支持任意 OpenAI 兼容接口 / 中转站 / 本地模型)。
        </div>
      )}

      {/* 生成 / 灵感 双模式 */}
      <div className="mb-3 flex shrink-0 gap-1 rounded-lg p-1" style={{ background: 'var(--panel-2)' }}>
        {tabBtn('gen', '生成', Wand2)}
        {tabBtn('chat', '灵感', MessageCircle)}
      </div>

      {/* ============ 生成模式(按写作流程分组:续写创作 → 本章辅助 → 润色优化) ============ */}
      {tab === 'gen' && (
        <>
          {/* 选中正文即现:润色快捷条 */}
          {hasSelection && (
            <div
              className="mb-3 flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
            >
              <Highlighter size={13} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                已选中正文 {selection ? selection.end - selection.start : 0} 字
              </span>
              <button className="btn-secondary !px-2.5 !py-1 !text-xs" onClick={() => void runGenerate('polish')}>
                润色选中
              </button>
            </div>
          )}

          {/* 续写创作区:意图 + 整章生成(P1 唯一实色) + 光标续写 */}
          <div>
            <div className="mb-1.5 px-0.5 text-[11px] font-semibold tracking-wider t3">续写创作</div>
            <label className="field-label">本章写作意图(可选)</label>
            <textarea
              className="field-input min-h-16 resize-y"
              placeholder="例如:主角当众被退婚,结尾亮出神秘底牌震惊全场"
              value={aiIntent}
              onChange={(e) => setAiIntent(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !disabled) {
                  e.preventDefault()
                  void runGenerate('chapter')
                }
              }}
            />
            <button
              className="btn-primary mt-2.5 w-full !py-2.5"
              disabled={disabled}
              onClick={() => void runGenerate('chapter')}
              title="按本章细纲 + 前情摘要生成整章初稿"
            >
              <Wand2 size={15} />
              <span className="text-sm font-semibold tracking-wide">生成整章</span>
            </button>
            <p className="mt-1.5 px-0.5 text-[11px] t3">Ctrl+Enter 快速生成 · 结合细纲、前情摘要与设定集成稿</p>
            <button
              className="btn-secondary mt-2 w-full !py-1.5 !text-xs"
              disabled={disabled || !content.trim()}
              onClick={() => void runGenerate('continue')}
              title="从光标位置接着写(未定位光标则从章末续)"
            >
              <Wand2 size={13} />
              从光标续写
            </button>
          </div>

          {/* 自动连写:续写创作的挂机形态,独立小卡 */}
          <div className="inset mt-3 p-2.5">
            {autoWrite?.running ? (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--accent-ink)' }}>
                <Loader2 size={14} className="shrink-0 animate-spin" />
                <span className="flex-1 truncate">
                  自动连写中 {autoWrite.done + 1}/{autoWrite.total}:{autoWrite.currentTitle}
                </span>
                <button className="btn-outline !py-1 !text-xs" onClick={() => void stopAutoWrite()}>
                  <Square size={12} />
                  停止连写
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs font-semibold t2">自动连写</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={autoCount}
                  onChange={(e) => setAutoCount(Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                  className="field-input !w-16 !px-2 !py-1 !text-xs text-center"
                />
                <span className="min-w-0 flex-1 truncate text-xs t3">章 · 只写空白章</span>
                <button
                  className="btn-outline ml-auto shrink-0 !px-2.5 !py-1 !text-xs"
                  disabled={!chapter}
                  onClick={() => void runAutoWrite(autoCount)}
                  title="从当前章往后,按大纲+前情记忆自动逐章生成;「写作意图」会应用于每一章"
                >
                  开始连写
                </button>
              </div>
            )}
          </div>

          {/* 本章辅助区:细纲 + 前情摘要(低频,默认折叠) */}
          <div className="mt-6">
            <div className="mb-1.5 px-0.5 text-[11px] font-semibold tracking-wider t3">本章辅助</div>
            <div className="inset p-1.5">
              <button
                className="btn-outline w-full !py-1.5 !text-xs"
                disabled={disabled}
                onClick={() => void runGenerate('outline')}
                title="生成本章情节细纲"
              >
                <RefreshCw size={13} />
                本章细纲
              </button>
              <button
                className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium t2 transition hover:bg-[var(--panel)]"
                onClick={() => setSummaryOpen((v) => !v)}
                title="展开/收起前情摘要"
              >
                {summaryOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                前情摘要
                <span className="truncate font-normal t3">写完本章后点一次,长篇不断片</span>
              </button>
              {summaryOpen && (
                <div className="pb-0.5">
                  <button
                    className="btn-outline w-full !py-1.5 !text-xs"
                    disabled={disabled || !content.trim()}
                    onClick={() => void runGenerate('summary')}
                    title="浓缩本章为前情摘要,写完一章后点一次,长篇不断片"
                  >
                    <RefreshCw size={13} />
                    生成前情摘要
                  </button>
                  <p className="mt-1.5 px-0.5 text-[11px] t3">摘要写入本章后,后续章节自动携带;同时本章新设定会自动入库。</p>
                </div>
              )}
            </div>
          </div>

          {/* 润色优化区 */}
          <div className="mt-6">
            <div className="mb-1.5 px-0.5 text-[11px] font-semibold tracking-wider t3">润色优化</div>
            <button
              className="btn-secondary w-full !py-1.5 !text-xs"
              disabled={disabled || !hasSelection}
              title={hasSelection ? '润色选中的文字' : '先在正文中选中一段文字'}
              onClick={() => void runGenerate('polish')}
            >
              <Highlighter size={13} />
              润色选中
            </button>
            <p className="mt-1.5 px-0.5 text-[11px] t3">回正文框选一段文字,这里随时可润色。</p>
          </div>

          {/* 设定调用感知:让用户知道生成时带了多少设定,一键去维护 */}
          <button
            className="mt-6 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] t3 transition hover:text-[var(--text)]"
            onClick={() => setWorkspaceMode('codex')}
            title="去设定中心维护人物 / 物品 / 世界观"
          >
            <Users size={12} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              生成时自动注入:人物 {book?.characters.length ?? 0} · 物品 {book?.items.length ?? 0} · 世界观
              {book?.worldview.setting.trim() ? '已就绪' : '待补充'}
            </span>
            <ChevronRight size={12} className="shrink-0" />
          </button>
        </>
      )}

      {/* ============ 灵感模式:边聊边想 ============ */}
      {tab === 'chat' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={chatScrollRef} className="min-h-32 flex-1 space-y-3 overflow-auto pr-1">
            {inspire.msgs.length === 0 && !inspire.stream && (
              <div className="py-2">
                <p className="serif text-sm leading-relaxed t2">
                  卡住了?把你的纠结说出来——
                  <span className="accent">想到哪聊到哪</span>,聊出的句子随时「插入到光标处」接着写。
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {QUICK_ASKS.map((q) => (
                    <button
                      key={q}
                      className="btn-outline !rounded-full !px-3 !py-1 !text-xs"
                      onClick={() => submitAsk(q)}
                      disabled={inspire.busy || aiRunning}
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs t3">
                  小技巧:可以先把卡住的那一段念给它听(选中正文后描述一下),让它顺着你的语境出主意。
                </p>
              </div>
            )}

            {inspire.msgs.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'user' ? (
                  <div
                    className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-br-md px-3.5 py-2 text-[13px] leading-relaxed"
                    style={{ background: 'var(--accent-soft)', color: 'var(--text)' }}
                  >
                    {m.content}
                  </div>
                ) : (
                  <div className="max-w-[96%] space-y-2">
                    <div
                      className="serif whitespace-pre-wrap rounded-2xl rounded-bl-md px-3.5 py-2 text-[13.5px] leading-[1.8]"
                      style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    >
                      {m.content}
                    </div>
                    {!inspire.busy && (
                      <div className="flex gap-1">
                        <button
                          className="btn-ghost !px-1.5 !py-0.5 !text-[11px]"
                          title="把这段插入到正文光标处"
                          onClick={() => {
                            insertInspire(m.content)
                            showToast('已插入到光标处')
                          }}
                        >
                          <CornerDownLeft size={11} />
                          插入到光标处
                        </button>
                        <button className="btn-ghost !px-1.5 !py-0.5 !text-[11px]" onClick={() => void copyInspireText(m.content)}>
                          <Copy size={11} />
                          复制
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* 流式接收中的回复 */}
            {inspire.stream && (
              <div className="flex justify-start">
                <div
                  className="serif max-w-[96%] whitespace-pre-wrap rounded-2xl rounded-bl-md px-3.5 py-2 text-[13.5px] leading-[1.8]"
                  style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                >
                  {inspire.stream}
                  <span className="inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse" style={{ background: 'var(--accent)' }} />
                </div>
              </div>
            )}

            {inspire.error && (
              <div
                className="rounded-lg px-3 py-2 text-xs leading-relaxed"
                style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', color: 'var(--danger)' }}
              >
                {inspire.error}
              </div>
            )}
          </div>

          {/* 输入区 */}
          <div className="mt-2 shrink-0" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <textarea
              className="field-input min-h-14 resize-none"
              placeholder={chapter ? '说说你卡在哪,或把刚写的念给它听…' : '先在左侧选择章节,建议会更贴合剧情'}
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              onKeyDown={(e) => {
                /* Ctrl+Enter = 立即发送(阻止冒泡,避免触发全局生成整章) */
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submitAsk()
                  return
                }
                /* 中文输入法组词中的 Enter 不发送 */
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submitAsk()
                }
              }}
            />
            <div className="mt-1.5 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[11px] t3">
                Enter 发送 · Shift+Enter 换行
                {chapter && book && ` · 第${book.chapters.findIndex((c) => c.id === chapter.id) + 1}章「${chapter.title}」· ${totalWords(book).toLocaleString('zh-CN')} 字上下文`}
              </span>
              {inspire.busy ? (
                <button className="btn-outline !px-2.5 !py-1 !text-xs" onClick={() => void stopInspire()}>
                  <Square size={12} />
                  停止
                </button>
              ) : (
                <button
                  className="btn-primary !px-3 !py-1 !text-xs"
                  disabled={!ask.trim() || inspire.busy || aiRunning}
                  title={aiRunning ? '正在生成正文,先等它出稿' : '发送 (Enter)'}
                  onClick={() => submitAsk()}
                >
                  <Send size={12} />
                  发送
                </button>
              )}
            </div>
            {/* 对话满时一键清空,避免上下文过长 */}
            {inspire.msgs.length > 0 && !inspire.busy && (
              <button
                className="btn-ghost mt-1 !px-1.5 !py-0.5 !text-[11px] t3"
                title="清空对话,重新开始(不影响正文)"
                onClick={clearInspire}
              >
                <Eraser size={11} />
                清空对话
              </button>
            )}
          </div>
        </div>
      )}

      {/* ============ 生成模式的输出区(流式中/错误提示对两模式通用性低,归入生成) ============ */}
      {tab === 'gen' && aiRunning && (
        <div
          className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
        >
          <Loader2 size={15} className="animate-spin" />
          <span className="flex-1">AI 正在输出{aiLastKind ? `(${KIND_LABEL[aiLastKind]})` : ''}……</span>
          <button className="btn-outline !py-1 !text-xs" onClick={() => void stopGenerate()}>
            <Square size={12} />
            停止
          </button>
        </div>
      )}

      {tab === 'gen' && aiError && (
        <div
          className="mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed"
          style={{
            background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
            color: 'var(--danger)'
          }}
        >
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1">{aiError}</span>
            {aiLastKind && !aiRunning && (
              <button
                className="btn-outline shrink-0 !py-1 !text-xs"
                title={`重新执行「${KIND_LABEL[aiLastKind]}」`}
                onClick={() => void runGenerate(aiLastKind)}
              >
                <RefreshCw size={12} />
                重试
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'gen' && aiOutput && (
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-medium t2">
              生成结果{aiLastKind ? ` · ${KIND_LABEL[aiLastKind]}` : ''}
            </span>
            <div className="flex items-center gap-1">
              <button className="btn-ghost !p-1.5" title="复制" onClick={() => void copyOutput()}>
                <Copy size={14} />
              </button>
              <button className="btn-ghost !p-1.5" title="清空" onClick={clearAiOutput}>
                <Clipboard size={14} className="rotate-180" />
              </button>
            </div>
          </div>
          <div className="panel serif min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 text-sm leading-relaxed">
            {aiOutput}
          </div>
        </div>
      )}
      {/* 操作按钮吸底:输出内容再长也始终可见(P2 描边级,不与主按钮抢视觉) */}
      {tab === 'gen' && aiOutput && ACTIONS.length > 0 && !aiRunning && (
        <div className="mt-2 flex flex-wrap gap-2 pt-2.5" style={{ borderTop: '1px solid var(--border)' }}>
          {ACTIONS.map((action) => (
            <button key={action.label} className="btn-secondary !px-2.5 !py-1 !text-xs" onClick={action.run}>
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
