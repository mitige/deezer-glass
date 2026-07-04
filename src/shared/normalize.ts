export function normalizeForMatch(s: string): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\(\[\{].*?[\)\]\}]/g, ' ')
    .replace(/\s(feat|ft|featuring)\.?\s.*$/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function makeTrackId(artist: string, title: string, durationMs: number): string {
  const sec = Math.floor((durationMs || 0) / 1000)
  return `${normalizeForMatch(artist)}|${normalizeForMatch(title)}|${sec}`
}
