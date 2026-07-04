import { buildLrclibGetUrl, mapLrclibResponse } from '../shared/lrclib'
import type { Lyrics } from '../shared/types'
import { loadLyricsCache, saveLyricsCache } from './store'

const mem = new Map<string, Lyrics>()
const cache = loadLyricsCache() as Record<string, Lyrics>

export async function getLyrics(track: {
  trackId: string; artist: string; title: string; album: string; durationMs: number
}): Promise<Lyrics> {
  if (mem.has(track.trackId)) return mem.get(track.trackId)!
  if (cache[track.trackId]) { mem.set(track.trackId, cache[track.trackId]); return cache[track.trackId] }

  let result: Lyrics = { synced: null, plain: null, source: 'lrclib' }
  try {
    const res = await fetch(buildLrclibGetUrl(track), { headers: { 'User-Agent': 'deezer-glass/0.1' } })
    if (res.ok) result = mapLrclibResponse(await res.json())
  } catch { /* offline -> empty result */ }

  mem.set(track.trackId, result)
  cache[track.trackId] = result
  saveLyricsCache(cache)
  return result
}
