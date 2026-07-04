import { buildLrclibGetUrl, buildLrclibSearchUrl, mapLrclibResponse, pickLrclibResult } from '../shared/lrclib'
import { buildGeniusSearchUrl, pickGeniusUrl, extractGeniusLyrics } from '../shared/genius'
import type { Lyrics } from '../shared/types'
import { loadLyricsCache, saveLyricsCache } from './store'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) deezer-glass/0.1'
const mem = new Map<string, Lyrics>()
const cache = loadLyricsCache() as Record<string, Lyrics>

type Track = { trackId: string; artist: string; title: string; album: string; durationMs: number }

async function fromLrclib(t: Track): Promise<Lyrics | null> {
  let got: Lyrics | null = null
  try {
    const res = await fetch(buildLrclibGetUrl(t), { headers: { 'User-Agent': UA } })
    if (res.ok) got = mapLrclibResponse(await res.json())
  } catch { /* exact-match endpoint unavailable */ }
  if (got?.synced?.length) return got
  // search fallback — finds time-synced lyrics the exact-match endpoint misses
  try {
    const res = await fetch(buildLrclibSearchUrl(t), { headers: { 'User-Agent': UA } })
    if (res.ok) {
      const picked = pickLrclibResult(await res.json(), { title: t.title, durationMs: t.durationMs })
      if (picked.synced?.length) return picked
      if (!got?.plain && picked.plain) got = picked
    }
  } catch { /* search endpoint unavailable */ }
  return got
}

async function fromGenius(t: Track): Promise<string | null> {
  try {
    const s = await fetch(buildGeniusSearchUrl(t.artist, t.title), { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (!s.ok) return null
    const url = pickGeniusUrl(await s.json(), t.artist, t.title)
    if (!url) return null
    const page = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!page.ok) return null
    return extractGeniusLyrics(await page.text())
  } catch { return null }
}

export async function getLyrics(track: Track): Promise<Lyrics> {
  if (mem.has(track.trackId)) return mem.get(track.trackId)!
  const cached = cache[track.trackId]
  if (cached) { mem.set(track.trackId, cached); return cached }

  const lrc = await fromLrclib(track)
  let result: Lyrics
  if (lrc?.synced?.length) {
    result = lrc // synced wins — enables karaoke highlight
  } else {
    const geniusPlain = lrc?.plain ? null : await fromGenius(track)
    const plain = lrc?.plain ?? geniusPlain ?? null
    const source: Lyrics['source'] = lrc?.plain ? 'lrclib' : geniusPlain ? 'genius' : 'none'
    result = { synced: null, plain, source }
  }

  mem.set(track.trackId, result)
  if (result.synced || result.plain) { cache[track.trackId] = result; saveLyricsCache(cache) }
  return result
}
