import type { AiResult, Book } from '@shared/types'
import { chunkText, parseJsonLoose } from '@shared/text'
import type { StoreState } from '../store'
import { persistBook } from './base'
import {
  delay,
  scanSignature,
  uid,
  type ImporterState,
  type ScanCharacter,
  type ScanItem,
  type ScanResults,
  type SliceCtx
} from './types'

function emptyImporter(): ImporterState {
  return {
    fileName: '',
    text: '',
    status: 'idle',
    progressCurrent: 0,
    progressTotal: 0,
    log: [],
    stop: false,
    currentRequestId: null,
    limitWan: 0,
    worldMode: 'append',
    resumeIndex: 0,
    resumeSig: '',
    failedChunks: [],
    results: { worldviewText: '', realms: [], items: [], characters: [] }
  }
}

/** 扫书导入切片:TXT/网页/粘贴文本 → 分段 AI 扫描 → 断点续扫/补扫 → 写入当前书 */
export interface ImporterSlice {
  importer: ImporterState

  importTxtFile: () => Promise<void>
  importFromUrl: (url: string) => Promise<void>
  setImportText: (text: string) => void
  setScanLimit: (wan: number) => void
  setWorldMode: (mode: 'append' | 'replace') => void
  startScan: (opts?: { fromScratch?: boolean }) => Promise<void>
  stopScan: () => Promise<void>
  removeScanRealm: (index: number) => void
  removeScanItem: (index: number) => void
  removeScanCharacter: (index: number) => void
  /** 单条导入:把某一条扫描结果单独写进当前书(自动去重) */
  applyScanRealm: (index: number) => void
  applyScanItem: (index: number) => void
  applyScanCharacter: (index: number) => void
  updateScanWorldview: (text: string) => void
  applyScanToBook: () => Promise<void>
}

export function importerSlice({ set, get }: SliceCtx): ImporterSlice {
  const persist = (mutate?: (draft: Book) => void) => persistBook({ set, get }, mutate)

  return {
    importer: emptyImporter(),

    importTxtFile: async () => {
      const loaded = await window.api.importer.openTxt()
      if (!loaded) return
      set((s) => ({
        importer: {
          ...s.importer,
          fileName: loaded.name,
          text: loaded.text,
          log: [`已载入《${loaded.name}》:${loaded.text.length.toLocaleString('zh-CN')} 字`]
        }
      }))
    },

    importFromUrl: async (url) => {
      const { importer } = get()
      if (importer.status === 'analyzing') return
      if (!url.trim()) {
        get().showToast('请填写网页链接', 'error')
        return
      }
      set((s) => ({ importer: { ...s.importer, log: [...s.importer.log, `正在抓取网页:${url}`] } }))
      const result = await window.api.importer.fetchUrl(url)
      if (result.ok && result.text) {
        set((s) => ({
          importer: {
            ...s.importer,
            fileName: url,
            text: result.text ?? '',
            log: [...s.importer.log, `抓取成功:${(result.text ?? '').length.toLocaleString('zh-CN')} 字`]
          }
        }))
      } else {
        set((s) => ({ importer: { ...s.importer, log: [...s.importer.log, `抓取失败:${result.error ?? '未知'}`] } }))
        get().showToast(`抓取失败:${result.error ?? '未知错误'}`, 'error')
      }
    },

    setImportText: (text) =>
      set((s) => ({ importer: { ...s.importer, text, fileName: text.trim() ? '粘贴的文本' : '' } })),
    setScanLimit: (wan) => set((s) => ({ importer: { ...s.importer, limitWan: Math.max(0, wan) } })),
    setWorldMode: (mode) => set((s) => ({ importer: { ...s.importer, worldMode: mode } })),

    startScan: async (opts) => {
      const imp = get().importer
      if (imp.status === 'analyzing') return
      if (!imp.text.trim()) {
        get().showToast('请先导入 TXT / 抓取网页 / 粘贴文本', 'error')
        return
      }
      const full = imp.limitWan > 0 ? imp.text.slice(0, imp.limitWan * 10000) : imp.text
      const chunks = chunkText(full)
      if (chunks.length === 0) return
      /* 三种入口:断点续扫(中途停止)/ 补扫失败段(已全过一遍但有段落失败)/ 从头扫描 */
      const sig = scanSignature(imp, full)
      const sigOk = !opts?.fromScratch && imp.resumeSig === sig
      const carriedFailed = sigOk
        ? [...new Set(imp.failedChunks)].filter((i) => i >= 0 && i < chunks.length)
        : []
      const canResume = sigOk && imp.resumeIndex > 0 && imp.resumeIndex < chunks.length
      const retryOnly = sigOk && !canResume && carriedFailed.length > 0 && imp.resumeIndex >= chunks.length
      const fresh = Boolean(opts?.fromScratch) || (!canResume && !retryOnly)

      let todo: number[]
      let startResumeIndex: number
      let modeLog: string
      if (retryOnly) {
        todo = carriedFailed
        startResumeIndex = imp.resumeIndex
        modeLog = `补扫失败段:共 ${carriedFailed.length} 段(其余段已扫过)`
      } else if (canResume) {
        todo = Array.from({ length: chunks.length - imp.resumeIndex }, (_, k) => imp.resumeIndex + k)
        startResumeIndex = imp.resumeIndex
        modeLog = `断点续扫:从第 ${startResumeIndex + 1} 段继续,共 ${chunks.length} 段`
      } else {
        todo = Array.from({ length: chunks.length }, (_, k) => k)
        startResumeIndex = 0
        modeLog = `开始扫描:共 ${chunks.length} 段(每段约 4500 字)`
      }
      const failedNow = new Set<number>(fresh ? [] : carriedFailed)

      set({
        importer: {
          ...imp,
          status: 'analyzing',
          stop: false,
          progressCurrent: 0,
          progressTotal: todo.length,
          resumeIndex: startResumeIndex,
          resumeSig: sig,
          failedChunks: fresh ? [] : carriedFailed,
          log: [modeLog]
        }
      })
      const log = (line: string) =>
        set((s) => ({ importer: { ...s.importer, log: [...s.importer.log.slice(-200), line] } }))

      /* 合并单段 AI 结果到累计集(去重),格式异常只跳过该段不报错 */
      const mergeResult = (i: number, text: string): void => {
        const parsed = parseJsonLoose<{
          worldview?: string
          realms?: string[]
          items?: Partial<ScanItem>[]
          characters?: Partial<ScanCharacter>[]
        }>(text)
        if (!parsed) {
          log(`第 ${i + 1} 段返回格式异常,已跳过`)
          return
        }
        set((s) => {
          const r: ScanResults = {
            worldviewText: s.importer.results.worldviewText,
            realms: [...s.importer.results.realms],
            items: [...s.importer.results.items],
            characters: [...s.importer.results.characters]
          }
          let facts = 0
          let realms = 0
          let items = 0
          let chars = 0
          const wv = parsed.worldview?.trim()
          if (wv && !r.worldviewText.includes(wv.slice(0, 30))) {
            r.worldviewText += (r.worldviewText ? '\n' : '') + '· ' + wv
            facts = 1
          }
          for (const realm of parsed.realms ?? []) {
            const t = realm.trim()
            if (t && !r.realms.some((x) => x.toLowerCase() === t.toLowerCase())) {
              r.realms.push(t)
              realms++
            }
          }
          for (const it of parsed.items ?? []) {
            const name = it.name?.trim()
            if (name && !r.items.some((x) => x.name === name)) {
              r.items.push({
                name,
                category: it.category?.trim() || '其他',
                grade: it.grade?.trim() ?? '',
                effect: it.effect?.trim() ?? '',
                origin: it.origin?.trim() ?? '',
                location: it.location?.trim() ?? ''
              })
              items++
            }
          }
          for (const c of parsed.characters ?? []) {
            const name = c.name?.trim()
            if (name && !r.characters.some((x) => x.name === name)) {
              r.characters.push({ name, role: c.role?.trim() ?? '' })
              chars++
            }
          }
          return {
            importer: {
              ...s.importer,
              results: r,
              log: [
                ...s.importer.log.slice(-200),
                `第 ${i + 1} 段完成:+${realms}境界 +${items}物品 +${chars}人物${facts ? ' +世界观要点' : ''}`
              ]
            }
          }
        })
      }

      /* 单段处理:指数退避多轮重试(3/6/12 秒),整本扫描时抗临时限流;仍失败由调用方记入失败段而不是终止 */
      const MAX_TRY = 4
      const processChunk = async (i: number): Promise<'ok' | 'failed' | 'stopped'> => {
        const requestId = uid()
        set((s) => ({ importer: { ...s.importer, currentRequestId: requestId } }))
        let result: AiResult | null = null
        for (let attempt = 1; attempt <= MAX_TRY; attempt++) {
          if (get().importer.stop) return 'stopped'
          result = await window.api.ai.scanChunk({ requestId, chunk: chunks[i] })
          if (result.ok) break
          if (attempt < MAX_TRY) {
            const wait = 3000 * 2 ** (attempt - 1)
            log(`第 ${i + 1} 段失败(${result.error ?? '未知'}),${wait / 1000} 秒后重试(${attempt}/${MAX_TRY - 1})…`)
            await delay(wait)
          }
        }
        if (get().importer.stop) return 'stopped'
        if (!result?.ok) return 'failed'
        mergeResult(i, result.text ?? '')
        return 'ok'
      }

      let doneCount = 0
      let aborted = false
      const runOne = async (i: number): Promise<void> => {
        set((s) => ({ importer: { ...s.importer, progressCurrent: doneCount + 1 } }))
        const status = await processChunk(i)
        if (status === 'stopped') {
          aborted = true
          return
        }
        if (status === 'ok') failedNow.delete(i)
        else {
          failedNow.add(i)
          log(`第 ${i + 1} 段重试 ${MAX_TRY} 次仍失败(可能被限流),已跳过,稍后自动补扫`)
        }
        doneCount++
        /* 无论成败都推进断点并落盘失败清单:中途停止也不会重扫已处理的段 */
        set((s) => ({
          importer: {
            ...s.importer,
            progressCurrent: doneCount,
            resumeIndex: Math.max(s.importer.resumeIndex, i + 1),
            failedChunks: [...failedNow]
          }
        }))
      }

      for (const i of todo) {
        if (get().importer.stop) {
          aborted = true
          break
        }
        await runOne(i)
        if (aborted) break
      }

      /* 第一遍结束后自动补扫失败段:免费模型的 429/503 多为临时,再给一轮机会 */
      if (!aborted && !get().importer.stop && failedNow.size > 0) {
        const retryList = [...failedNow]
        log(`第一遍完成,自动补扫 ${retryList.length} 个失败段…`)
        set((s) => ({ importer: { ...s.importer, progressTotal: doneCount + retryList.length } }))
        for (const i of retryList) {
          if (get().importer.stop) {
            aborted = true
            break
          }
          await runOne(i)
          if (aborted) break
        }
      }

      const stopped = get().importer.stop
      const remaining = [...failedNow].sort((a, b) => a - b)
      const finished = !aborted && !stopped && remaining.length === 0
      set((s) => ({
        importer: {
          ...s.importer,
          status: 'idle',
          currentRequestId: null,
          failedChunks: remaining,
          /* 全部段落扫完且无失败才清断点;否则保留 resumeIndex/resumeSig/failedChunks 供续扫与补扫 */
          ...(finished ? { resumeIndex: 0, resumeSig: '', failedChunks: [] } : {})
        }
      }))
      const r = get().importer.results
      const stats = `${r.realms.length} 境界 / ${r.items.length} 物品 / ${r.characters.length} 人物`
      if (stopped) {
        get().showToast(`扫描已停止:已收集 ${stats},点「继续扫描」可断点续扫`)
      } else if (remaining.length > 0) {
        get().showToast(`整本已扫完一遍,但 ${remaining.length} 段失败(多为限流),点「补扫失败段」重试`, 'error')
      } else {
        get().showToast(
          `扫描完成:${r.realms.length} 个境界、${r.items.length} 件物品、${r.characters.length} 位人物`
        )
      }
    },

    stopScan: async () => {
      const imp = get().importer
      if (imp.status !== 'analyzing') return
      set({ importer: { ...imp, stop: true } })
      if (imp.currentRequestId) await window.api.ai.abort(imp.currentRequestId)
    },

    removeScanRealm: (index) =>
      set((s) => {
        const realms = [...s.importer.results.realms]
        realms.splice(index, 1)
        return { importer: { ...s.importer, results: { ...s.importer.results, realms } } }
      }),

    removeScanItem: (index) =>
      set((s) => {
        const items = [...s.importer.results.items]
        items.splice(index, 1)
        return { importer: { ...s.importer, results: { ...s.importer.results, items } } }
      }),

    removeScanCharacter: (index) =>
      set((s) => {
        const characters = [...s.importer.results.characters]
        characters.splice(index, 1)
        return { importer: { ...s.importer, results: { ...s.importer.results, characters } } }
      }),

    applyScanRealm: (index) => {
      const realm = get().importer.results.realms[index]
      if (!realm) return
      if (get().book?.worldview.powerSystem.includes(realm)) {
        get().showToast(`「${realm}」已在境界体系中`, 'error')
        return
      }
      void persist((draft) => {
        if (draft.worldview.powerSystem.includes(realm)) return
        draft.worldview.powerSystem = draft.worldview.powerSystem.trim()
          ? draft.worldview.powerSystem.trim() + ' → ' + realm
          : realm
      }).then(() => get().showToast(`已写入境界:${realm}`))
    },

    applyScanItem: (index) => {
      const it = get().importer.results.items[index]
      if (!it) return
      if (get().book?.items.some((x) => x.name.trim() === it.name)) {
        get().showToast(`「${it.name}」已在物品图鉴中`, 'error')
        return
      }
      void persist((draft) => {
        if (draft.items.some((x) => x.name.trim() === it.name)) return
        draft.items.push({
          id: uid(),
          name: it.name,
          category: it.category,
          grade: it.grade,
          appearance: '',
          effect: it.effect,
          origin: it.origin,
          location: it.location,
          owner: '',
          stage: '扫书导入',
          notes: ''
        })
      }).then(() => get().showToast(`已写入物品:${it.name}`))
    },

    applyScanCharacter: (index) => {
      const c = get().importer.results.characters[index]
      if (!c) return
      if (get().book?.characters.some((x) => x.name.trim() === c.name)) {
        get().showToast(`「${c.name}」已在人物卡中`, 'error')
        return
      }
      void persist((draft) => {
        if (draft.characters.some((x) => x.name.trim() === c.name)) return
        draft.characters.push({
          id: uid(),
          name: c.name,
          role: c.role || '扫书导入',
          personality: '',
          background: '',
          arc: '',
          notes: ''
        })
      }).then(() => get().showToast(`已写入人物:${c.name}`))
    },

    updateScanWorldview: (text) =>
      set((s) => ({ importer: { ...s.importer, results: { ...s.importer.results, worldviewText: text } } })),

    applyScanToBook: async () => {
      const { importer, book } = get()
      if (!book) return
      const r = importer.results
      const newItemCount = r.items.filter((it) => !book.items.some((x) => x.name.trim() === it.name)).length
      const newCharCount = r.characters.filter((c) => !book.characters.some((x) => x.name.trim() === c.name)).length
      if (!r.worldviewText.trim() && r.realms.length === 0 && newItemCount === 0 && newCharCount === 0) {
        get().showToast('没有可写入的新内容(可能与现有设定重复)', 'error')
        return
      }
      await persist((draft) => {
        const replace = importer.worldMode === 'replace'
        if (r.realms.length > 0) {
          const realmText = r.realms.join(' → ')
          draft.worldview.powerSystem =
            replace || !draft.worldview.powerSystem.trim()
              ? realmText
              : draft.worldview.powerSystem.trim() + '\n' + realmText
        }
        if (r.worldviewText.trim()) {
          draft.worldview.setting =
            replace || !draft.worldview.setting.trim()
              ? r.worldviewText.trim()
              : draft.worldview.setting.trim() + '\n' + r.worldviewText.trim()
        }
        const itemNames = new Set(draft.items.map((x) => x.name.trim()))
        for (const it of r.items) {
          if (itemNames.has(it.name)) continue
          draft.items.push({
            id: uid(),
            name: it.name,
            category: it.category,
            grade: it.grade,
            appearance: '',
            effect: it.effect,
            origin: it.origin,
            location: it.location,
            owner: '',
            stage: '扫书导入',
            notes: ''
          })
        }
        const charNames = new Set(draft.characters.map((x) => x.name.trim()))
        for (const c of r.characters) {
          if (charNames.has(c.name)) continue
          draft.characters.push({
            id: uid(),
            name: c.name,
            role: c.role || '扫书导入',
            personality: '',
            background: '',
            arc: '',
            notes: ''
          })
        }
      })
      get().showToast(`已写入当前书:新增 ${newItemCount} 件物品卡、${newCharCount} 张人物卡,世界观/境界已更新`)
    }
  }
}
