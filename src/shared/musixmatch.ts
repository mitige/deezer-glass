import { parseLrc } from './lrc'
import type { LyricLine } from './types'

const BASE = 'https://apic-desktop.musixmatch.com/ws/1.1'
const APP_ID = 'web-desktop-app-v1.0'

export function buildMxmTokenUrl(): string {
  return `${BASE}/token.get?app_id=${APP_ID}&format=json`
}

export function buildMxmSubtitleUrl(artist: string, title: string, token: string): string {
  const p = new URLSearchParams({
    format: 'json',
    namespace: 'lyrics_richsynched',
    subtitle_format: 'lrc',
    q_artist: artist,
    q_track: title,
    usertoken: token,
    app_id: APP_ID,
  })
  return `${BASE}/macro.subtitles.get?${p.toString()}`
}

export function parseMusixmatchMacro(json: unknown): { synced: LyricLine[] | null; plain: string | null; matchedTitle: string | null; matchedArtist: string | null } {
  const macro = (json as { message?: { body?: { macro_calls?: Record<string, unknown> } } })?.message?.body?.macro_calls
  const sub = macro?.['track.subtitles.get'] as { message?: { body?: { subtitle_list?: Array<{ subtitle?: { subtitle_body?: string } }> } } } | undefined
  const lyr = macro?.['track.lyrics.get'] as { message?: { body?: { lyrics?: { lyrics_body?: string } } } } | undefined
  const trk = macro?.['matcher.track.get'] as { message?: { body?: { track?: { track_name?: string; artist_name?: string } } } } | undefined
  const subBody = sub?.message?.body?.subtitle_list?.[0]?.subtitle?.subtitle_body
  const plainBody = lyr?.message?.body?.lyrics?.lyrics_body
  const mt = trk?.message?.body?.track
  const synced = typeof subBody === 'string' && subBody.trim() ? parseLrc(subBody) : null
  return {
    synced: synced && synced.length ? synced : null,
    plain: typeof plainBody === 'string' && plainBody.trim() ? plainBody : null,
    matchedTitle: typeof mt?.track_name === 'string' ? mt.track_name : null,
    matchedArtist: typeof mt?.artist_name === 'string' ? mt.artist_name : null,
  }
}
