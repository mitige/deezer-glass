import { buildDeezerUserDataUrl, buildDeezerLyricsUrl, buildDeezerSearchUrl, pickDeezerTrackId, parseDeezerSync } from '../shared/deezer'
import type { Lyrics } from '../shared/types'
import { loadConfig } from './store'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
let session: { token: string; sid: string } | null = null

async function getSession(arl: string): Promise<{ token: string; sid: string } | null> {
  if (session) return session
  try {
    const r = await fetch(buildDeezerUserDataUrl(), { headers: { 'User-Agent': UA, Cookie: `arl=${arl}` } })
    if (!r.ok) return null
    const sid = (r.headers.getSetCookie?.() ?? []).join('; ').match(/sid=([^;]+)/)?.[1]
    const j = await r.json()
    const token = j?.results?.checkForm
    const userId = j?.results?.USER?.USER_ID
    if (typeof token === 'string' && token && sid && userId && userId !== 0) {
      session = { token, sid }
      return session
    }
  } catch { /* auth failed */ }
  return null
}

export async function getDeezerLyrics(track: { artist: string; title: string; durationMs: number }): Promise<Lyrics | null> {
  const arl = loadConfig().deezerArl
  if (!arl || arl.length < 20) return null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const sess = await getSession(arl)
      if (!sess) return null
      const searchRes = await fetch(buildDeezerSearchUrl(track.artist, track.title), { headers: { 'User-Agent': UA } })
      const sngId = searchRes.ok ? pickDeezerTrackId(await searchRes.json(), track) : null
      if (!sngId) return null
      const r = await fetch(buildDeezerLyricsUrl(sess.token), {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Cookie: `arl=${arl}; sid=${sess.sid}` },
        body: JSON.stringify({ sng_id: sngId }),
      })
      const j = await r.json()
      // session/token expired -> reset once and retry
      if (j?.error && (j.error.VALID_TOKEN_REQUIRED !== undefined || j.error.GATEWAY_ERROR !== undefined)) { session = null; continue }
      const synced = parseDeezerSync(j?.results?.LYRICS_SYNC_JSON)
      const text = typeof j?.results?.LYRICS_TEXT === 'string' ? j.results.LYRICS_TEXT : null
      if (synced.length) return { synced, plain: text, source: 'deezer' }
      if (text && text.trim()) return { synced: null, plain: text, source: 'deezer' }
      return null
    } catch { return null }
  }
  return null
}
