import { buildSearchEmbedUrl, buildIdEmbedUrl, extractVideoId } from '../shared/clip'
import type { ClipResult } from '../shared/types'

export async function resolveClip(track: { artist: string; title: string }): Promise<ClipResult> {
  try {
    const q = encodeURIComponent(`${track.artist} ${track.title} official video`)
    const res = await fetch(`https://www.youtube.com/results?search_query=${q}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en', Cookie: 'CONSENT=YES+1' },
    })
    if (res.ok) {
      const id = extractVideoId(await res.text())
      if (id) return { embedUrl: buildIdEmbedUrl(id), videoId: id }
    }
  } catch { /* fall through */ }
  return { embedUrl: buildSearchEmbedUrl(track.artist, track.title), videoId: null }
}
