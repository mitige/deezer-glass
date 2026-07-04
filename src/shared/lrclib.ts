import { parseLrc } from './lrc'
import { normalizeForMatch } from './normalize'
import type { Lyrics } from './types'

export interface LrclibQuery { artist: string; title: string; album: string; durationMs: number }

export function buildLrclibGetUrl(q: LrclibQuery): string {
  const p = new URLSearchParams({
    artist_name: q.artist,
    track_name: q.title,
    album_name: q.album,
    duration: String(Math.floor((q.durationMs || 0) / 1000)),
  })
  return `https://lrclib.net/api/get?${p.toString()}`
}

export function buildLrclibSearchUrl(q: { artist: string; title: string }): string {
  return `https://lrclib.net/api/search?q=${encodeURIComponent(`${q.artist} ${q.title}`.trim())}`
}

interface LrclibRecord {
  trackName?: string; artistName?: string; duration?: number
  syncedLyrics?: string | null; plainLyrics?: string | null
}

// From a search result list, pick the best entry: a time-synced one whose title matches
// and whose duration is within tolerance (so we never sync against a different edit), else
// the closest plain match. Returns synced/plain, never a far-off synced version.
export function pickLrclibResult(results: unknown, target: { title: string; durationMs: number }): Lyrics {
  const list = Array.isArray(results) ? (results as LrclibRecord[]) : []
  const targetSec = Math.floor((target.durationMs || 0) / 1000)
  const want = normalizeForMatch(target.title)
  const durDelta = (r: LrclibRecord) => (targetSec > 0 && r.duration ? Math.abs(r.duration - targetSec) : 999)
  const titleOk = (r: LrclibRecord) => {
    const t = normalizeForMatch(r.trackName ?? '')
    return !want || !t || t.includes(want) || want.includes(t)
  }
  const byDur = (a: LrclibRecord, b: LrclibRecord) => durDelta(a) - durDelta(b)

  const synced = list.filter((r) => r.syncedLyrics && titleOk(r) && durDelta(r) <= 15).sort(byDur)[0]
  if (synced?.syncedLyrics) return mapLrclibResponse(synced)

  const plain = list.filter((r) => r.plainLyrics && titleOk(r)).sort(byDur)[0]
  if (plain?.plainLyrics) return { synced: null, plain: plain.plainLyrics, source: 'lrclib' }

  return { synced: null, plain: null, source: 'lrclib' }
}

export function mapLrclibResponse(r: { syncedLyrics?: string | null; plainLyrics?: string | null } | null): Lyrics {
  const synced = r?.syncedLyrics ? parseLrc(r.syncedLyrics) : null
  return {
    synced: synced && synced.length ? synced : null,
    plain: r?.plainLyrics ?? null,
    source: 'lrclib',
  }
}
