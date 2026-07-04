export function normalizeForMatch(s: string): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(feat|ft|featuring|with)\b.*$/g, '')
    .replace(/[\(\[\{].*?[\)\]\}]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function makeTrackId(artist: string, title: string, durationMs: number): string {
  const sec = Math.floor((durationMs || 0) / 1000)
  return `${normalizeForMatch(artist)}|${normalizeForMatch(title)}|${sec}`
}
