import { buildDeezerSearchUrl, pickDeezerCover, buildItunesSearchUrl, pickItunesCover } from '../shared/cover'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) deezer-glass/0.1'
const mem = new Map<string, string | null>()

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) return null
    const type = res.headers.get('content-type') || 'image/jpeg'
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) return null
    return `data:${type};base64,${buf.toString('base64')}`
  } catch { return null }
}

export async function resolveCover(track: { trackId?: string; artist: string; title: string }): Promise<string | null> {
  const key = track.trackId ?? `${track.artist}|${track.title}`
  if (mem.has(key)) return mem.get(key)!
  let cover: string | null = null
  try {
    const d = await fetch(buildDeezerSearchUrl(track.artist, track.title), { headers: { 'User-Agent': UA } })
    if (d.ok) cover = pickDeezerCover(await d.json(), track.artist, track.title)
  } catch { /* deezer down */ }
  if (!cover) {
    try {
      const i = await fetch(buildItunesSearchUrl(track.artist, track.title), { headers: { 'User-Agent': UA } })
      if (i.ok) cover = pickItunesCover(await i.json(), track.artist, track.title)
    } catch { /* itunes down */ }
  }
  const dataUrl = cover ? await toDataUrl(cover) : null
  mem.set(key, dataUrl)
  return dataUrl
}
