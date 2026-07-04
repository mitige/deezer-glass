function norm(s: string): string { return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }

export function buildDeezerSearchUrl(artist: string, title: string): string {
  return `https://api.deezer.com/search?q=${encodeURIComponent(`${artist} ${title}`.trim())}&limit=5`
}

export function pickDeezerCover(json: unknown, artist: string, title: string): string | null {
  const data = (json as { data?: unknown[] })?.data
  if (!Array.isArray(data)) return null
  const wantA = norm(artist), wantT = norm(title)
  let fallback: string | null = null
  for (const d of data) {
    const rec = d as { title?: string; artist?: { name?: string }; album?: { cover_xl?: string; cover_big?: string } }
    const cover = rec?.album?.cover_xl || rec?.album?.cover_big
    if (!cover) continue
    if (fallback === null) fallback = cover
    const t = norm(rec?.title ?? ''), a = norm(rec?.artist?.name ?? '')
    if (wantT && t.includes(wantT) && (a.includes(wantA) || wantA.includes(a))) return cover
  }
  return fallback
}

export function buildItunesSearchUrl(artist: string, title: string): string {
  return `https://itunes.apple.com/search?term=${encodeURIComponent(`${artist} ${title}`.trim())}&entity=song&limit=5`
}

export function pickItunesCover(json: unknown, artist: string, title: string): string | null {
  const results = (json as { results?: unknown[] })?.results
  if (!Array.isArray(results)) return null
  const wantA = norm(artist), wantT = norm(title)
  let fallback: string | null = null
  for (const r of results) {
    const rec = r as { trackName?: string; artistName?: string; artworkUrl100?: string }
    const art = rec?.artworkUrl100
    if (!art) continue
    const hi = art.replace(/\/\d+x\d+bb\.(jpg|png)/i, '/1000x1000bb.$1')
    if (fallback === null) fallback = hi
    const t = norm(rec?.trackName ?? ''), a = norm(rec?.artistName ?? '')
    if (wantT && t.includes(wantT) && (a.includes(wantA) || wantA.includes(a))) return hi
  }
  return fallback
}
