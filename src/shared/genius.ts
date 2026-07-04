export function buildGeniusSearchUrl(artist: string, title: string): string {
  return `https://genius.com/api/search?q=${encodeURIComponent(`${artist} ${title}`.trim())}`
}

function norm(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function pickGeniusUrl(json: unknown, artist: string, title: string): string | null {
  const hits = (json as { response?: { hits?: unknown[] } })?.response?.hits
  if (!Array.isArray(hits)) return null
  const wantT = norm(title), wantA = norm(artist)
  for (const h of hits) {
    const r = (h as { result?: { url?: string; title?: string; primary_artist?: { name?: string } } })?.result
    const url = r?.url
    if (!url) continue
    const t = norm(r?.title ?? ''), a = norm(r?.primary_artist?.name ?? '')
    const titleOk = !!wantT && !!t && (t.includes(wantT) || wantT.includes(t))
    const artistOk = !!wantA && !!a && (a.includes(wantA) || wantA.includes(a))
    if (titleOk && artistOk) return url
  }
  return null // no blind fallback — showing nothing beats showing the wrong song's lyrics
}

const CONTAINER = /data-lyrics-container[^>]*>([\s\S]*?)<\/div>/gi
const NAMED: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
}

export function extractGeniusLyrics(html: string): string | null {
  const blocks: string[] = []
  let m: RegExpExecArray | null
  CONTAINER.lastIndex = 0
  while ((m = CONTAINER.exec(html)) !== null) blocks.push(m[1] ?? '')
  if (!blocks.length) return null
  const text = blocks.join('\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z]+;/gi, (e) => NAMED[e.toLowerCase()] ?? e)
    .replace(/^\s*\d+\s*Contributors?.*(?:\r?\n|$)/i, '')
    .replace(/You might also like/gi, '')
    .replace(/\d*\s*Embed\s*$/i, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text || null
}
