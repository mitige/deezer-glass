export function normalizeForMatch(s: string): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\(\[\{].*?[\)\]\}]/g, ' ')
    .replace(/\s(feat|ft|featuring)\.?\s.*$/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Looser variant: strips accents + non-alphanumerics but keeps ALL content (no feat/parenthesis
// removal). Needed so symbol-heavy titles like "(+34)" become "34" instead of "" — an empty
// normalized title disables title matching and lets wrong songs (e.g. "Groovin") slip through.
export function normalizeLoose(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function makeTrackId(artist: string, title: string, durationMs: number): string {
  const sec = Math.floor((durationMs || 0) / 1000)
  return `${normalizeForMatch(artist)}|${normalizeForMatch(title)}|${sec}`
}
