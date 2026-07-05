import type { LyricLine } from './types'
import { normalizeLoose } from './normalize'

const GW = 'https://www.deezer.com/ajax/gw-light.php'

export function buildDeezerUserDataUrl(): string {
  return `${GW}?method=deezer.getUserData&input=3&api_version=1.0&api_token=`
}
export function buildDeezerLyricsUrl(apiToken: string): string {
  return `${GW}?method=song.getLyrics&input=3&api_version=1.0&api_token=${encodeURIComponent(apiToken)}`
}
export function buildDeezerSearchUrl(artist: string, title: string): string {
  return `https://api.deezer.com/search?q=${encodeURIComponent(`${artist} ${title}`.trim())}`
}

interface DeezerHit { id?: number | string; title?: string; artist?: { name?: string }; album?: { title?: string }; duration?: number }

// Rank the Deezer track ids whose title+artist match, preferring the SAME ALBUM (so we get the
// exact version playing — different masters have different lyric timing), then closest duration.
// Returns a ranked list so the caller can try several until one actually has synced lyrics.
export function rankDeezerTrackIds(json: unknown, target: { title: string; artist: string; album?: string; durationMs: number }): string[] {
  const data = (json as { data?: DeezerHit[] })?.data
  if (!Array.isArray(data)) return []
  const wantT = normalizeLoose(target.title), wantA = normalizeLoose(target.artist), wantAl = normalizeLoose(target.album ?? '')
  const targetSec = Math.round((target.durationMs || 0) / 1000)
  const bidir = (a: string, b: string) => !a || !b || a.includes(b) || b.includes(a)
  return data
    .filter((d) => d?.id != null
      && bidir(normalizeLoose(d.title ?? ''), wantT)
      && bidir(normalizeLoose(d.artist?.name ?? ''), wantA))
    .map((d) => {
      const albumMatch = wantAl !== '' && bidir(normalizeLoose(d.album?.title ?? ''), wantAl)
      return { id: String(d.id), score: (albumMatch ? 0 : 10000) + Math.abs((d.duration ?? 0) - targetSec) }
    })
    .sort((a, b) => a.score - b.score)
    .map((s) => s.id)
}

export function parseDeezerSync(sync: unknown): LyricLine[] {
  if (!Array.isArray(sync)) return []
  const out: LyricLine[] = []
  for (const e of sync) {
    const ms = Number((e as { milliseconds?: string | number })?.milliseconds)
    if (!Number.isFinite(ms)) continue
    out.push({ timeMs: ms, text: String((e as { line?: string })?.line ?? '') })
  }
  return out
}
