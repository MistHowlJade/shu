import * as fs from 'node:fs'
import * as path from 'node:path'

/** 解码文本:优先 UTF-8(严格模式),失败回退 GBK(常见于中文网文 txt) */
function decodeBuffer(buf: Buffer, contentType?: string): string {
  const charset = contentType ? /charset=["']?([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase() : null
  if (charset?.includes('gb')) return new TextDecoder('gbk').decode(buf)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('gbk').decode(buf)
  }
}

export function readTxtFile(file: string): { name: string; text: string } {
  const buf = fs.readFileSync(file)
  let text = decodeBuffer(buf)
  text = text.replace(/^\uFEFF/, '')
  return { name: path.basename(file), text }
}

/** 抓取网页正文:去除脚本/样式/标签,保留文本行 */
export async function fetchWebpageText(url: string): Promise<string> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('URL 格式不正确:' + url)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('只支持 http/https 链接')
  }
  const res = await fetch(parsed.href, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8'
    },
    signal: AbortSignal.timeout(25000)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const html = decodeBuffer(buf, res.headers.get('content-type') ?? undefined)
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
  if (!text) throw new Error('该页面没有提取到正文文本')
  return text
}
