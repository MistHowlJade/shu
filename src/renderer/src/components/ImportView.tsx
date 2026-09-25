import { useState } from 'react'
import { Clipboard, FileSearch, FileText, Globe, Loader2, Plus, ScanSearch, Square, Trash2, X } from 'lucide-react'
import { chunkText, scanSignature, useStore } from '../store'

export default function ImportView() {
  const importer = useStore((s) => s.importer)
  const importTxtFile = useStore((s) => s.importTxtFile)
  const importFromUrl = useStore((s) => s.importFromUrl)
  const setImportText = useStore((s) => s.setImportText)
  const setScanLimit = useStore((s) => s.setScanLimit)
  const setWorldMode = useStore((s) => s.setWorldMode)
  const startScan = useStore((s) => s.startScan)
  const stopScan = useStore((s) => s.stopScan)
  const removeScanRealm = useStore((s) => s.removeScanRealm)
  const removeScanItem = useStore((s) => s.removeScanItem)
  const removeScanCharacter = useStore((s) => s.removeScanCharacter)
  const applyScanRealm = useStore((s) => s.applyScanRealm)
  const applyScanItem = useStore((s) => s.applyScanItem)
  const applyScanCharacter = useStore((s) => s.applyScanCharacter)
  const updateScanWorldview = useStore((s) => s.updateScanWorldview)
  const applyScanToBook = useStore((s) => s.applyScanToBook)
  const showToast = useStore((s) => s.showToast)
  const [url, setUrl] = useState('')

  const analyzing = importer.status === 'analyzing'
  const fullText = importer.limitWan > 0 ? importer.text.slice(0, importer.limitWan * 10000) : importer.text
  const chunkCount = importer.text ? chunkText(fullText).length : 0
  const r = importer.results
  const hasResults = r.worldviewText.trim() || r.realms.length > 0 || r.items.length > 0 || r.characters.length > 0
  const progressPct = importer.progressTotal > 0 ? Math.round((importer.progressCurrent / importer.progressTotal) * 100) : 0
  /* 断点签名与 store.startScan 保持一致:文本/限制未变且上次没扫完才可续 */
  const canResume =
    !analyzing &&
    importer.resumeIndex > 0 &&
    importer.resumeIndex < chunkCount &&
    importer.resumeSig === scanSignature(importer, fullText)
  /* 全书已过一遍但有段落失败(多为限流)→ 只定向重试失败段 */
  const hasFailed =
    !analyzing && importer.failedChunks.length > 0 && importer.resumeSig === scanSignature(importer, fullText)

  /* 高危确认:覆盖模式开始扫描前强制二次确认 */
  function confirmStart(fromScratch?: boolean): void {
    if (importer.worldMode === 'replace') {
      if (!window.confirm('覆盖模式会清空当前书的对应设定后再写入扫描结果,确认继续?')) return
    }
    void startScan(fromScratch ? { fromScratch: true } : undefined)
  }

  return (
    <div className="flex min-h-0 flex-1 gap-5 p-4">
      {/* 左:来源与控制(独立白卡) */}
      <div className="panel flex w-[30rem] shrink-0 flex-col overflow-auto p-5">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <FileSearch size={15} />
          </span>
          <h2 className="text-[15px] font-semibold tracking-wide">拆书扫书</h2>
        </div>
        <p className="mt-1 text-xs t3">导入文本,AI 分段扫描提取设定,一键写入当前书。</p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn-outline" disabled={analyzing} onClick={() => void importTxtFile()}>
            <FileText size={14} />
            选择 TXT 文件
          </button>
          <div className="flex gap-1">
            <input
              className="field-input !py-1.5 !text-xs"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="网页/章节链接"
            />
            <button
              className="btn-outline shrink-0 !px-2"
              title="抓取网页正文"
              disabled={analyzing}
              onClick={() => void importFromUrl(url)}
            >
              <Globe size={14} />
            </button>
          </div>
        </div>

        <label className="field-label mt-3">或直接粘贴文本</label>
        <textarea
          className="field-input min-h-24 resize-y font-mono !text-xs"
          value={importer.text ? importer.text.slice(0, 3000) : ''}
          /* 展示区只有前 3000 字:变更时把 3000 字之后的原文原样接回去,避免一次按键把整篇导入文本截断 */
          onChange={(e) => setImportText(e.target.value + importer.text.slice(3000))}
          placeholder="把小说文本粘贴到这里(仅展示前 3000 字,完整内容参与扫描)"
          disabled={analyzing}
        />
        {importer.text && (
          <p className="mt-1 text-xs t3">
            {importer.fileName ? `《${importer.fileName}》· ` : ''}
            共 {importer.text.length.toLocaleString('zh-CN')} 字,预计 {chunkCount} 段扫描
            {importer.limitWan > 0 ? `(只扫前 ${importer.limitWan} 万字)` : ''}
            {canResume ? `;上次扫到第 ${importer.resumeIndex} 段,点「继续扫描」从断点接着扫` : ''}
            {hasFailed ? `;${importer.failedChunks.length} 段扫描失败(多为限流),点「补扫失败段」定向重试` : ''}
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">只扫描前 N 万字(0=全部)</label>
            <input
              type="number"
              min={0}
              className="field-input !py-1.5 !text-xs"
              value={importer.limitWan}
              onChange={(e) => setScanLimit(parseInt(e.target.value, 10) || 0)}
              disabled={analyzing}
            />
          </div>
          <div>
            <label className="field-label">世界观写入方式</label>
            <div className="flex gap-1">
              {(['append', 'replace'] as const).map((m) => (
                <button
                  key={m}
                  className={`btn-outline !px-2.5 !py-1.5 !text-xs ${importer.worldMode === m ? 'active' : ''}`}
                  onClick={() => setWorldMode(m)}
                >
                  {m === 'append' ? '追加' : '覆盖'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-center gap-2">
          {analyzing ? (
            <button className="btn-outline" onClick={() => void stopScan()}>
              <Square size={14} />
              停止扫描
            </button>
          ) : (
            <>
              <button className="btn-primary" disabled={!importer.text.trim()} onClick={() => confirmStart()}>
                <ScanSearch size={14} />
                {canResume
                  ? `继续扫描(第 ${importer.resumeIndex + 1}/${chunkCount} 段)`
                  : hasFailed
                    ? `补扫失败段(${importer.failedChunks.length} 段)`
                    : '开始扫描'}
              </button>
              {(canResume || hasFailed) && (
                <button
                  className="btn-outline"
                  title="放弃断点,从第 1 段重新扫描(已有结果会按去重保留)"
                  onClick={() => confirmStart(true)}
                >
                  重新扫描
                </button>
              )}
            </>
          )}
        </div>

        {analyzing && (
          <div className="mt-2">
            <div
              className="h-1.5 w-full overflow-hidden rounded-full"
              style={{
                background: 'color-mix(in srgb, var(--text) 7%, var(--bg))',
                boxShadow: 'inset 0 1px 2px rgba(18, 20, 26, 0.08)'
              }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${progressPct}%`,
                  background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 68%, #fff 32%), var(--accent))',
                  boxShadow: '0 0 8px -2px color-mix(in srgb, var(--accent) 55%, transparent)',
                  transition: 'width 0.4s cubic-bezier(0.32, 0.72, 0, 1)'
                }}
              />
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs accent">
              <Loader2 size={12} className="animate-spin" />
              第 {importer.progressCurrent}/{importer.progressTotal} 段
            </p>
          </div>
        )}

        {importer.log.length > 0 && (
          <div className="inset mt-3 min-h-24 flex-1 overflow-auto p-2 font-mono text-[11px] leading-relaxed t2">
            {importer.log.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
      </div>

      {/* 右:扫描结果(独立白卡) */}
      <div className="flex min-w-0 flex-1 flex-col overflow-auto p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">扫描结果</h2>
          <button
            className="btn-outline !h-8 !px-2.5 !text-xs"
            disabled={analyzing || !hasResults}
            onClick={() => void applyScanToBook()}
            title="把结果写入当前打开的书(自动去重)"
          >
            全部写入当前书
          </button>
        </div>

        {!hasResults && !analyzing && (
          <div className="mt-3 flex flex-1 items-center justify-center">
            <p className="text-xs t3">导入文本并开始扫描后,提取到的设定会出现在这里</p>
          </div>
        )}

        {hasResults && (
          <div className="mt-3 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <label className="field-label">世界观要点(可直接编辑,写入「世界背景」)</label>
                <button
                  className="btn-ghost !px-1.5 !py-0.5 !text-[11px]"
                  title="复制全部要点"
                  onClick={() => {
                    void navigator.clipboard.writeText(r.worldviewText)
                    showToast('已复制')
                  }}
                >
                  <Clipboard size={11} />
                  复制
                </button>
              </div>
              <textarea
                className="field-input min-h-28 resize-y !text-xs"
                value={r.worldviewText}
                onChange={(e) => updateScanWorldview(e.target.value)}
              />
            </div>

            <div>
              <label className="field-label">境界 / 等级体系(写入「力量等级体系」,按顺序连接;+ 号单条导入)</label>
              <div className="flex flex-wrap gap-1.5">
                {r.realms.length === 0 && <span className="text-xs t3">未提取到</span>}
                {r.realms.map((realm, i) => (
                  <span
                    key={realm + i}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
                  >
                    {realm}
                    <button title="单独写入当前书" onClick={() => applyScanRealm(i)} className="opacity-70 hover:opacity-100">
                      <Plus size={11} />
                    </button>
                    <button title="移除这一条" onClick={() => removeScanRealm(i)} className="opacity-60 hover:text-[var(--danger)]">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="field-label">功法 / 物品 / 材料({r.items.length} 件,写入物品图鉴)</label>
              <div className="panel max-h-72 overflow-auto">
                {r.items.length === 0 && <p className="p-3 text-xs t3">未提取到</p>}
                {r.items.map((it, i) => (
                  <div key={it.name + i} className="flex items-center gap-2 px-3 py-1.5 text-xs last:border-0" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="w-28 shrink-0 truncate font-medium">{it.name}</span>
                    <span className="w-16 shrink-0 t3">{it.category}</span>
                    <span className="w-20 shrink-0 truncate t3">{it.grade || '—'}</span>
                    <span className="min-w-0 flex-1 truncate t2">{it.effect || '—'}</span>
                    <button
                      className="shrink-0 t3 hover:text-[var(--text)]"
                      title="复制这一条"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          `${it.name}(${it.category}${it.grade ? ' · ' + it.grade : ''}):${it.effect || ''}`
                        )
                        showToast('已复制')
                      }}
                    >
                      <Clipboard size={12} />
                    </button>
                    <button className="shrink-0 t3 hover:text-[var(--accent)]" title="单独写入当前书" onClick={() => applyScanItem(i)}>
                      <Plus size={12} />
                    </button>
                    <button className="shrink-0 t3 hover:text-[var(--danger)]" title="移除这一条" onClick={() => removeScanItem(i)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="field-label">人物({r.characters.length} 位,写入人物卡;+ 号单条导入)</label>
              <div className="flex flex-wrap gap-1.5">
                {r.characters.length === 0 && <span className="text-xs t3">未提取到</span>}
                {r.characters.map((c, i) => (
                  <span
                    key={c.name + i}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
                    style={{ background: 'var(--panel-2)' }}
                  >
                    {c.name}
                    {c.role && <span className="t3">({c.role})</span>}
                    <button title="单独写入当前书" onClick={() => applyScanCharacter(i)} className="opacity-70 hover:opacity-100">
                      <Plus size={11} />
                    </button>
                    <button title="移除这一条" onClick={() => removeScanCharacter(i)} className="t3 hover:text-[var(--danger)]">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
