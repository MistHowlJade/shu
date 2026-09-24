import type { Book, Character, ItemEntry, Worldview } from '@shared/types'
import { parseJsonLoose } from '@shared/text'
import type { StoreState } from '../store'
import { persistBook } from './base'
import { uid, type SliceCtx } from './types'

/** 设定中心切片:人物/世界观/物品的增删改 + AI 起名、物品生成、物品提取、新设定自动入库 */
export interface CodexSlice {
  namingBusy: boolean
  nameCandidates: string[]
  itemBusy: boolean
  extractBusy: boolean

  addCharacter: () => Promise<void>
  addCharacterNamed: (name: string, role: string) => Promise<void>
  updateCharacter: (id: string, patch: Partial<Character>) => Promise<void>
  removeCharacter: (id: string) => Promise<void>
  updateWorldview: (patch: Partial<Worldview>) => void

  addItem: () => Promise<void>
  updateItem: (id: string, patch: Partial<ItemEntry>) => void
  removeItem: (id: string) => Promise<void>
  /** AI 起名:生成候选名列表 */
  generateNames: (hint: string) => Promise<void>
  /** AI 生成物品卡(直接建卡) */
  generateItem: (category: string, hint: string) => Promise<void>
  /** 从当前章节提取阶段性物品 */
  extractItemsFromChapter: () => Promise<void>
  /** 自动设定检测:扫本章并静默入库(受 settings.autoScan 控制) */
  autoDetectChapter: () => Promise<void>
}

export function codexSlice({ set, get }: SliceCtx): CodexSlice {
  const persist = (mutate?: (draft: Book) => void) => persistBook({ set, get }, mutate)

  return {
    namingBusy: false,
    nameCandidates: [],
    itemBusy: false,
    extractBusy: false,

    addCharacter: async () => {
      await persist((draft) => {
        draft.characters.push({
          id: uid(),
          name: '新人物',
          role: '',
          personality: '',
          background: '',
          arc: '',
          notes: ''
        })
      })
    },

    addCharacterNamed: async (name, role) => {
      await persist((draft) => {
        draft.characters.push({
          id: uid(),
          name,
          role: role || '',
          personality: '',
          background: '',
          arc: '',
          notes: ''
        })
      })
      get().showToast(`已创建人物卡:${name}`)
    },

    updateCharacter: async (id, patch) => {
      // 局部即时更新(避免每次击键都写盘),失焦时统一持久化
      set((state) => {
        if (!state.book) return {}
        return {
          book: {
            ...state.book,
            characters: state.book.characters.map((c) => (c.id === id ? { ...c, ...patch } : c))
          }
        }
      })
    },

    removeCharacter: async (id) => {
      await persist((draft) => {
        draft.characters = draft.characters.filter((c) => c.id !== id)
      })
    },

    updateWorldview: (patch) => {
      set((state) => (state.book ? { book: { ...state.book, worldview: { ...state.book.worldview, ...patch } } } : {}))
    },

    addItem: async () => {
      await persist((draft) => {
        draft.items.push({
          id: uid(),
          name: '新物品',
          category: '',
          grade: '',
          appearance: '',
          effect: '',
          origin: '',
          location: '',
          owner: '',
          stage: '',
          notes: ''
        })
      })
    },

    updateItem: (id, patch) => {
      set((state) => {
        if (!state.book) return {}
        return {
          book: {
            ...state.book,
            items: state.book.items.map((it) => (it.id === id ? { ...it, ...patch } : it))
          }
        }
      })
    },

    removeItem: async (id) => {
      await persist((draft) => {
        draft.items = draft.items.filter((it) => it.id !== id)
      })
    },

    generateNames: async (hint) => {
      const { namingBusy, bookDir, book } = get()
      if (namingBusy || !bookDir || !book) return
      set({ namingBusy: true, nameCandidates: [] })
      try {
        const result = await window.api.ai.generateNames({ requestId: uid(), dir: bookDir, hint })
        if (result.ok && result.text) {
          const names = result.text
            .split(/[\n\r]+/)
            .map((s) => s.trim().replace(/^[-·•\d]+[.、)）]?\s*/, ''))
            .filter((s) => s && s.length <= 12)
            .slice(0, 8)
          set({ nameCandidates: names })
        } else {
          get().showToast(`起名失败:${result.error ?? '未知错误'}`, 'error')
        }
      } finally {
        set({ namingBusy: false })
      }
    },

    generateItem: async (category, hint) => {
      const { itemBusy, bookDir, book } = get()
      if (itemBusy || !bookDir || !book) return
      set({ itemBusy: true })
      try {
        const result = await window.api.ai.generateItem({ requestId: uid(), dir: bookDir, category, hint })
        if (!result.ok || !result.text) {
          get().showToast(`生成物品失败:${result.error ?? '未知错误'}`, 'error')
          return
        }
        const parsed = parseJsonLoose<Partial<ItemEntry>>(result.text)
        if (!parsed || !parsed.name?.trim()) {
          get().showToast('AI 返回的格式无法解析,请重试一次', 'error')
          return
        }
        await persist((draft) => {
          draft.items.push({
            id: uid(),
            name: parsed.name!.trim(),
            category: category.trim() || parsed.category?.trim() || '其他',
            grade: parsed.grade?.trim() ?? '',
            appearance: parsed.appearance?.trim() ?? '',
            effect: parsed.effect?.trim() ?? '',
            origin: parsed.origin?.trim() ?? '',
            location: parsed.location?.trim() ?? '',
            owner: parsed.owner?.trim() ?? '',
            stage: '',
            notes: parsed.notes?.trim() ?? ''
          })
        })
        get().showToast(`已生成物品卡:${parsed.name.trim()}`)
      } finally {
        set({ itemBusy: false })
      }
    },

    extractItemsFromChapter: async () => {
      const { extractBusy, bookDir, book, chapter } = get()
      if (extractBusy || !bookDir || !book || !chapter) return
      set({ extractBusy: true })
      try {
        const result = await window.api.ai.extractItems({ requestId: uid(), dir: bookDir, chapterId: chapter.id, intent: '' })
        if (!result.ok || !result.text) {
          get().showToast(`提取失败:${result.error ?? '未知错误'}`, 'error')
          return
        }
        const parsed = parseJsonLoose<Array<Partial<ItemEntry>>>(result.text)
        if (!parsed || !Array.isArray(parsed)) {
          get().showToast('AI 返回的格式无法解析,请重试一次', 'error')
          return
        }
        const chapterIndex = book.chapters.findIndex((m) => m.id === chapter.id) + 1
        const stageLabel = chapterIndex > 0 ? `第${chapterIndex}章《${chapter.title}》` : chapter.title
        const existingNames = new Set(book.items.map((it) => it.name.trim()))
        const fresh = parsed.filter(
          (it) => it.name?.trim() && !existingNames.has(it.name.trim())
        )
        if (fresh.length === 0) {
          get().showToast('本章没有提取到新物品')
          return
        }
        await persist((draft) => {
          for (const it of fresh) {
            draft.items.push({
              id: uid(),
              name: it.name!.trim(),
              category: it.category?.trim() || '其他',
              grade: it.grade?.trim() ?? '',
              appearance: it.appearance?.trim() ?? '',
              effect: it.effect?.trim() ?? '',
              origin: it.origin?.trim() ?? '',
              location: it.location?.trim() ?? '',
              owner: it.owner?.trim() ?? '',
              stage: it.stage?.trim() || stageLabel,
              notes: ''
            })
          }
        })
        get().showToast(`本章提取到 ${fresh.length} 件物品,已建卡`)
      } finally {
        set({ extractBusy: false })
      }
    },

    /* ---------------- 新设定自动入库 ---------------- */

    autoDetectChapter: async () => {
      const { settings, bookDir, chapter } = get()
      if (!settings.autoScan || !bookDir || !chapter) return
      try {
        /* 主进程按磁盘正文扫描,未保存的内容先落盘 */
        if (get().dirty) await get().saveNow()
        const result = await window.api.ai.scanChapter({ dir: bookDir, chapterId: chapter.id })
        if (!result.ok) {
          if (result.error) get().showToast(`新设定检测失败:${result.error}`, 'error')
          return
        }
        const { newCharacters, newItems, newRealms, worldAdded } = result
        const parts = [
          newCharacters > 0 && `人物 ${newCharacters}`,
          newItems > 0 && `物品 ${newItems}`,
          newRealms > 0 && `境界 ${newRealms}`,
          worldAdded && '世界观'
        ].filter(Boolean)
        if (parts.length === 0) return
        /* 主进程只返回增量(不再写 book.json):合并进当前内存副本后由 persistBook 统一落盘,
           避免整体覆盖内存里未保存的编辑,也避免扫描期间切书造成的跨书污染 */
        const incChar = result.addedCharacters ?? []
        const incItem = result.addedItems ?? []
        const incRealm = result.addedRealms ?? []
        const incWorld = result.addedWorldLines ?? []
        await persist((draft) => {
          const charNames = new Set(draft.characters.map((c) => c.name.trim()))
          for (const c of incChar) {
            if (charNames.has(c.name.trim())) continue
            charNames.add(c.name.trim())
            draft.characters.push(c)
          }
          const itemNames = new Set(draft.items.map((it) => it.name.trim()))
          for (const it of incItem) {
            if (itemNames.has(it.name.trim())) continue
            itemNames.add(it.name.trim())
            draft.items.push(it)
          }
          for (const realm of incRealm) {
            if (draft.worldview.powerSystem.includes(realm)) continue
            draft.worldview.powerSystem = draft.worldview.powerSystem.trim()
              ? draft.worldview.powerSystem.trim() + ' → ' + realm
              : realm
          }
          for (const line of incWorld) {
            if (draft.worldview.setting.includes(line.slice(0, 30))) continue
            draft.worldview.setting = draft.worldview.setting.trim()
              ? draft.worldview.setting.trim() + '\n· ' + line
              : '· ' + line
          }
        })
        get().showToast(`检测到新设定,已自动入库:${parts.join('、')}`)
      } catch (err) {
        get().showToast(`新设定检测失败:${err instanceof Error ? err.message : String(err)}`, 'error')
      }
    }
  }
}
