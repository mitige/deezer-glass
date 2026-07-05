import { parseLrc } from './lrc'
import { normalizeLoose } from './normalize'
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

// From a search result list, pick the best entry: a time-synced one whose title AND artist match
// and whose duration is within tolerance (so we never sync against a different edit or a name
// collision like "Pato" vs "Pato Banton"), else the closest plain match. Title/artist use a loose
// normalization that keeps alphanumerics, so symbol-only titles like "(+34)" -> "34" still guard.
export function pickLrclibResult(results: unknown, target: { title: string; artist: string; durationMs: number }): Lyrics {
  const list = Array.isArray(results) ? (results as LrclibRecord[]) : []
  const targetSec = Math.floor((target.durationMs || 0) / 1000)
  const wantT = normalizeLoose(target.title)
  const wantA = normalizeLoose(target.artist)
  const durDelta = (r: LrclibRecord) => (targetSec > 0 && r.duration ? Math.abs(r.duration - targetSec) : 999)
  const bidir = (a: string, b: string) => !a || !b || a.includes(b) || b.includes(a)
  const ok = (r: LrclibRecord) =>
    bidir(normalizeLoose(r.trackName ?? ''), wantT) && bidir(normalizeLoose(r.artistName ?? ''), wantA)
  const byDur = (a: LrclibRecord, b: LrclibRecord) => durDelta(a) - durDelta(b)

  const synced = list.filter((r) => r.syncedLyrics && ok(r) && durDelta(r) <= 4).sort(byDur)[0]
  if (synced?.syncedLyrics) return mapLrclibResponse(synced)

  const plain = list.filter((r) => r.plainLyrics && ok(r)).sort(byDur)[0]
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
