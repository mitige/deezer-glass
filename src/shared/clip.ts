const BASE = 'https://www.youtube-nocookie.com'
const COMMON = 'autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1'

export function buildSearchEmbedUrl(artist: string, title: string): string {
  const q = `${artist} ${title} official video`.trim()
  return `${BASE}/embed?listType=search&list=${encodeURIComponent(q)}&${COMMON}`
}

export function buildIdEmbedUrl(videoId: string): string {
  return `${BASE}/embed/${encodeURIComponent(videoId)}?${COMMON}`
}

export function extractVideoId(html: string): string | null {
  const m = html.match(/"videoId":"([\w-]{11})"/)
  return m?.[1] ?? null
}
