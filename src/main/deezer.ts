import { buildDeezerUserDataUrl, buildDeezerLyricsUrl, buildDeezerSearchUrl, rankDeezerTrackIds, parseDeezerSync } from '../shared/deezer'
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

async function fetchLyrics(arl: string, sess: { token: string; sid: string }, sngId: string): Promise<{ synced: ReturnType<typeof parseDeezerSync>; plain: string | null } | 'expired' | null> {
  const r = await fetch(buildDeezerLyricsUrl(sess.token), {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Cookie: `arl=${arl}; sid=${sess.sid}` },
    body: JSON.stringify({ sng_id: sngId }),
  })
  const j = await r.json()
  if (j?.error && (j.error.VALID_TOKEN_REQUIRED !== undefined || j.error.GATEWAY_ERROR !== undefined)) return 'expired'
  const synced = parseDeezerSync(j?.results?.LYRICS_SYNC_JSON)
  const plain = typeof j?.results?.LYRICS_TEXT === 'string' ? j.results.LYRICS_TEXT : null
  return { synced, plain }
}

export async function getDeezerLyrics(track: { artist: string; title: string; album?: string; durationMs: number }): Promise<Lyrics | null> {
  const arl = loadConfig().deezerArl
  if (!arl || arl.length < 20) return null
  try {
    let sess = await getSession(arl)
    if (!sess) return null
    const searchRes = await fetch(buildDeezerSearchUrl(track.artist, track.title), { headers: { 'User-Agent': UA } })
    if (!searchRes.ok) return null
    // try the top album/duration-ranked candidates until one actually has lyrics
    const ids = rankDeezerTrackIds(await searchRes.json(), track).slice(0, 4)
    let firstPlain: string | null = null
    for (const sngId of ids) {
      let res = await fetchLyrics(arl, sess, sngId)
      if (res === 'expired') { session = null; sess = await getSession(arl); if (!sess) return null; res = await fetchLyrics(arl, sess, sngId) }
      if (res && res !== 'expired') {
        if (res.synced.length) return { synced: res.synced, plain: res.plain, source: 'deezer' } // exact-version synced wins
        if (res.plain && res.plain.trim() && !firstPlain) firstPlain = res.plain
      }
    }
    if (firstPlain) return { synced: null, plain: firstPlain, source: 'deezer' }
    return null
  } catch { return null }
}
