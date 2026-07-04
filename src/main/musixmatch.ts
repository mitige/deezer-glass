import { buildMxmTokenUrl, buildMxmSubtitleUrl, parseMusixmatchMacro } from '../shared/musixmatch'
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

export async function getMusixmatch(track: { artist: string; title: string }): Promise<Lyrics | null> {
  let token = await getToken()
  if (!token) return null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(buildMxmSubtitleUrl(track.artist, track.title, token), { headers: { 'User-Agent': UA, cookie: COOKIE } })
      if (r.status === 401) { cachedToken = null; token = await getToken(); if (!token) return null; continue }
      if (!r.ok) return null
      const parsed = parseMusixmatchMacro(await r.json())
      if (parsed.synced || parsed.plain) return { synced: parsed.synced, plain: parsed.plain, source: 'musixmatch' }
      return null
    } catch { return null }
  }
  return null
}
