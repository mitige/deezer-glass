import { buildMxmTokenUrl, buildMxmSubtitleUrl, parseMusixmatchMacro } from '../shared/musixmatch'
import { normalizeLoose } from '../shared/normalize'
import type { Lyrics } from '../shared/types'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) deezer-glass/0.1'
const COOKIE = 'x-mxm-token-guid=1'
let cachedToken: string | null = null

async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken
  try {
    const r = await fetch(buildMxmTokenUrl(), { headers: { 'User-Agent': UA, cookie: COOKIE } })
    if (!r.ok) return null
    const j = await r.json()
    const t = j?.message?.body?.user_token
    if (typeof t === 'string' && t && !/Upgrade/.test(t)) { cachedToken = t; return t }
  } catch { /* token endpoint unavailable */ }
  return null
}

export async function getMusixmatch(track: { artist: string; title: string; durationMs?: number }): Promise<Lyrics | null> {
  let token = await getToken()
  if (!token) return null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(buildMxmSubtitleUrl(track.artist, track.title, token), { headers: { 'User-Agent': UA, cookie: COOKIE } })
      if (r.status === 401) { cachedToken = null; token = await getToken(); if (!token) return null; continue }
      if (!r.ok) return null
      const parsed = parseMusixmatchMacro(await r.json())
      if (!parsed.synced && !parsed.plain) return null
      // Musixmatch's matcher can return a different song on a miss (e.g. "Pato" -> "Pato Banton");
      // only trust the result if the matched track's title AND artist loosely match the request.
      const bidir = (a: string, b: string) => !a || !b || a.includes(b) || b.includes(a)
      const titleOk = bidir(normalizeLoose(parsed.matchedTitle ?? ''), normalizeLoose(track.title))
      const artistOk = bidir(normalizeLoose(parsed.matchedArtist ?? ''), normalizeLoose(track.artist))
      if (!titleOk || !artistOk) return null
      // Duration alignment: a synced version whose length differs from Deezer's is a different
      // master (mistimed) — drop the synced so we never show offset karaoke; keep any plain text.
      let synced = parsed.synced
      if (synced && parsed.matchedLength && track.durationMs) {
        if (Math.abs(parsed.matchedLength - Math.round(track.durationMs / 1000)) > 4) synced = null
      }
      if (!synced && !parsed.plain) return null
      return { synced, plain: parsed.plain, source: 'musixmatch' }
    } catch { return null }
  }
  return null
}
