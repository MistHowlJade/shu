/* eslint-disable */
/**
 * 扫书结果核对工具(开发模式专用):
 * 1. 通过 CDP(127.0.0.1:9222)连接应用渲染进程,取 window.__store;
 * 2. 把小说文本前 N 字导入拆书工作区,驱动真实扫描管线 startScan();
 * 3. 轮询到扫描结束后,把 importer.results 落盘为 JSON,供与原文比对。
 *
 * 用法:node scripts/verify-scan.mjs <小说txt路径> <扫描字数> <结果输出路径>
 * 例:node scripts/verify-scan.mjs "D:/下载/《完美世界》作者：辰东.txt" 50000 out/scan-results.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [, , novelPath, limitArg, outPath] = process.argv
const LIMIT = Number(limitArg) || 50000
const OUT = outPath || join(dirname(fileURLToPath(import.meta.url)), '../scan-results.json')

function decodeNovel(buf) {
  for (const enc of ['utf-8', 'gbk']) {
    const text = new TextDecoder(enc).decode(buf)
    const bad = (text.match(/\uFFFD/g) || []).length
    if (bad < text.length * 0.001) return { enc, text }
  }
  return { enc: 'gbk', text: new TextDecoder('gbk').decode(buf) }
}

/* ---------- 极简 CDP 客户端(内置 WebSocket) ---------- */
async function connectPage() {
  const list = await (await fetch('http://127.0.0.1:9222/json/list')).json()
  const pages = list.filter((t) => t.type === 'page')
  if (pages.length === 0) throw new Error('CDP 未发现应用页面:' + JSON.stringify(list.map((t) => t.title)))
  const page = pages.find((t) => /5173|localhost/.test(t.url)) ?? pages[0]
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  let seq = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result)
    }
  }
  return async function evaluate(expression) {
    const id = ++seq
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    const result = await new Promise((res, rej) => pending.set(id, { res, rej }))
    if (result.exceptionDetails) throw new Error('页面执行异常:' + JSON.stringify(result.exceptionDetails.exception?.description ?? result.exceptionDetails))
    return result.result?.value
  }
}

const evalInPage = await connectPage()

/* 等渲染进程就绪(__store 挂载、init 完成) */
let ready = false
for (let i = 0; i < 60 && !ready; i++) {
  ready = await evalInPage('!!window.__store && window.__store.getState().ready').catch(() => false)
  if (!ready) await new Promise((r) => setTimeout(r, 1000))
}
if (!ready) throw new Error('应用未就绪(__store 不存在或 init 未完成)')

const status0 = await evalInPage(`(() => { const s = window.__store.getState(); return { view: s.view, books: s.books.length, mode: s.workspaceMode } })()`)
console.log('[应用状态]', JSON.stringify(status0))

/* 确保已打开一本书(拆书写入目标) */
await evalInPage(`(async () => {
  const s = window.__store.getState()
  if (s.view !== 'workspace') {
    if (s.settings.lastBookPath) await s.openBookAt(s.settings.lastBookPath)
    else if (s.books[0]) await s.openBookAt(s.books[0].dir)
  }
  if (s.workspaceMode !== 'import') s.setWorkspaceMode('import')
})()`)

/* 导入小说前 LIMIT 字并启动扫描 */
const { enc, text } = decodeNovel(readFileSync(novelPath))
const slice = text.slice(0, LIMIT)
console.log(`[原文] 编码 ${enc},全文 ${text.length.toLocaleString()} 字,本次导入前 ${slice.length.toLocaleString()} 字`)

const before = await evalInPage(`(async () => {
  const s = window.__store.getState()
  s.setImportText(${JSON.stringify(slice)})
  s.setScanLimit(0)
  s.setWorldMode('append')
  await s.startScan()
  const imp = window.__store.getState().importer
  return { status: imp.status, log: imp.log, results: imp.results }
})()`)

console.log('[扫描结束] status =', before.status)
console.log('[日志]', before.log.slice(-8).join(' / '))
writeFileSync(OUT, JSON.stringify({ novelPath, enc, imported: slice.length, ...before }, null, 2))
console.log('[已导出]', OUT)
