/* eslint-disable */
/**
 * 扫书结果 ↔ 原文比对:
 * 逐条检查人物/物品/境界/世界观要点是否真的出现在被扫描的文本范围内。
 *
 * 用法:node scripts/compare-scan.mjs <小说txt路径> <扫描字数> <scan-results.json>
 */
import { readFileSync } from 'node:fs'

const [, , novelPath, limitArg, resultsPath] = process.argv
const LIMIT = Number(limitArg) || 50000

function decodeNovel(buf) {
  for (const enc of ['utf-8', 'gbk']) {
    const text = new TextDecoder(enc).decode(buf)
    const bad = (text.match(/\uFFFD/g) || []).length
    if (bad < text.length * 0.001) return text
  }
  return new TextDecoder('gbk').decode(buf)
}

const full = decodeNovel(readFileSync(novelPath))
const scope = full.slice(0, LIMIT)
const { results } = JSON.parse(readFileSync(resultsPath, 'utf8'))

function stat(name) {
  const inScope = scope.split(name).length - 1
  const inFull = inScope > 0 ? inScope : full.split(name).length - 1
  const firstAt = full.indexOf(name)
  return { inScope, inFull, firstAt }
}

function pct(i) {
  return i < 0 ? '未出现' : `第 ${(i / 10000).toFixed(1)} 万字处`
}

let ok = 0
let bad = 0
const rows = []

console.log(`扫描范围:原文前 ${LIMIT.toLocaleString()} 字(共 ${full.length.toLocaleString()} 字)\n`)

console.log('== 人物 ==')
for (const c of results.characters) {
  const s = stat(c.name)
  const verdict = s.inScope > 0 ? '✓ 正确' : s.inFull > 0 ? `△ 不在扫描范围(出自${pct(s.firstAt)})` : '✗ 全文未见'
  if (verdict.startsWith('✓')) ok++
  else bad++
  rows.push(verdict)
  console.log(`${verdict}  ${c.name}(${c.role || '?'}) 命中范围 ${s.inScope} 次`)
}

console.log('\n== 物品 ==')
for (const it of results.items) {
  const s = stat(it.name)
  const verdict = s.inScope > 0 ? '✓ 正确' : s.inFull > 0 ? `△ 不在扫描范围(出自${pct(s.firstAt)})` : '✗ 全文未见'
  if (verdict.startsWith('✓')) ok++
  else bad++
  console.log(`${verdict}  ${it.name}(${it.category}${it.grade ? '·' + it.grade : ''}) 命中范围 ${s.inScope} 次`)
}

console.log('\n== 境界 ==')
for (const r of results.realms) {
  const s = stat(r)
  const verdict = s.inScope > 0 ? '✓ 正确' : s.inFull > 0 ? `△ 不在扫描范围(出自${pct(s.firstAt)})` : '✗ 全文未见'
  if (verdict.startsWith('✓')) ok++
  else bad++
  console.log(`${verdict}  ${r} 命中范围 ${s.inScope} 次`)
}

console.log('\n== 世界观要点 ==')
for (const line of results.worldviewText.split('\n')) {
  const key = line.replace(/^·\s*/, '').trim().slice(0, 12)
  if (!key) continue
  const s = stat(key)
  const verdict = s.inScope > 0 ? '✓ 有原文依据' : s.inFull > 0 ? `△ 出处较远(${pct(s.firstAt)})` : '✗ 无原文依据'
  if (verdict.startsWith('✓')) ok++
  else bad++
  console.log(`${verdict}  ${key}…`)
}

console.log(`\n合计:✓ ${ok} 条对得上,△/✗ ${bad} 条存疑`)
