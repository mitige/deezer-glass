import { parseLrc } from './lrc'
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

export function mapLrclibResponse(r: { syncedLyrics?: string | null; plainLyrics?: string | null } | null): Lyrics {
  const synced = r?.syncedLyrics ? parseLrc(r.syncedLyrics) : null
  return {
    synced: synced && synced.length ? synced : null,
    plain: r?.plainLyrics ?? null,
    source: 'lrclib',
  }
}
