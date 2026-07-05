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

interface DeezerHit { id?: number | string; title?: string; artist?: { name?: string }; duration?: number }

export function pickDeezerTrackId(json: unknown, target: { title: string; artist: string; durationMs: number }): string | null {
  const data = (json as { data?: DeezerHit[] })?.data
  if (!Array.isArray(data)) return null
  const wantT = normalizeLoose(target.title), wantA = normalizeLoose(target.artist)
  const targetSec = Math.round((target.durationMs || 0) / 1000)
  const bidir = (a: string, b: string) => !a || !b || a.includes(b) || b.includes(a)
  const cand = data.filter((d) => d?.id != null
    && bidir(normalizeLoose(d.title ?? ''), wantT)
    && bidir(normalizeLoose(d.artist?.name ?? ''), wantA))
  if (!cand.length) return null
  cand.sort((a, b) => Math.abs((a.duration ?? 0) - targetSec) - Math.abs((b.duration ?? 0) - targetSec))
  return String(cand[0]!.id)
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
