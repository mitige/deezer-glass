import { buildLrclibGetUrl, buildLrclibSearchUrl, pickLrclibResult, mapLrclibResponse } from './lrclib'

describe('buildLrclibGetUrl', () => {
  it('builds a get query with seconds duration', () => {
    const u = new URL(buildLrclibGetUrl({ artist: 'A B', title: 'T (live)', album: 'Al', durationMs: 208_400 }))
    expect(u.origin + u.pathname).toBe('https://lrclib.net/api/get')
    expect(u.searchParams.get('artist_name')).toBe('A B')
    expect(u.searchParams.get('track_name')).toBe('T (live)')
    expect(u.searchParams.get('duration')).toBe('208')
  })
})

describe('buildLrclibSearchUrl', () => {
  it('hits the search endpoint with artist + title', () => {
    const u = new URL(buildLrclibSearchUrl({ artist: 'A', title: 'T' }))
    expect(u.origin + u.pathname).toBe('https://lrclib.net/api/search')
    expect(u.searchParams.get('q')).toBe('A T')
  })
})

describe('pickLrclibResult', () => {
  const results = [
    { trackName: 'Wrong Song', artistName: 'X', duration: 208, syncedLyrics: '[00:01.00]nope' },
    { trackName: 'Red Flags', artistName: 'Brittany Howard', duration: 208, syncedLyrics: '[00:02.00]hi', plainLyrics: 'hi' },
    { trackName: 'Red Flags', artistName: 'Brittany Howard', duration: 400, syncedLyrics: '[00:03.00]long', plainLyrics: 'long' },
  ]
  it('prefers synced with a matching title/artist and closest duration', () => {
    const r = pickLrclibResult(results, { title: 'Red Flags', artist: 'Brittany Howard', durationMs: 208_000 })
    expect(r.synced).toEqual([{ timeMs: 2000, text: 'hi' }])
  })
  it('never syncs against a far-off-duration edit (falls back to plain)', () => {
    const r = pickLrclibResult([results[2]], { title: 'Red Flags', artist: 'Brittany Howard', durationMs: 208_000 })
    expect(r.synced).toBeNull()
    expect(r.plain).toBe('long')
  })
  it('rejects a title collision on a symbol title ("(+34)" must not match "Groovin")', () => {
    const hits = [{ trackName: 'Groovin', artistName: 'Pato Banton', duration: 145, syncedLyrics: '[00:01.00]sunshine', plainLyrics: 'sunshine' }]
    const r = pickLrclibResult(hits, { title: '(+34)', artist: 'Pato', durationMs: 145_000 })
    expect(r.synced).toBeNull()
    expect(r.plain).toBeNull()
  })
  it('does not sync against a moderately-off duration (mistimed master) — falls back to plain', () => {
    const hits = [{ trackName: 'Song', artistName: 'A', duration: 210, syncedLyrics: '[00:01.00]x', plainLyrics: 'x' }]
    const r = pickLrclibResult(hits, { title: 'Song', artist: 'A', durationMs: 200_000 })
    expect(r.synced).toBeNull()
    expect(r.plain).toBe('x')
  })
  it('returns empty when nothing has lyrics', () => {
    expect(pickLrclibResult([], { title: 'x', artist: 'y', durationMs: 1000 })).toEqual({ synced: null, plain: null, source: 'lrclib' })
  })
})

describe('mapLrclibResponse', () => {
  it('prefers synced lyrics', () => {
    const r = mapLrclibResponse({ syncedLyrics: '[00:01.00]hi', plainLyrics: 'hi' })
    expect(r.synced).toEqual([{ timeMs: 1000, text: 'hi' }])
    expect(r.source).toBe('lrclib')
  })
  it('falls back to plain', () => {
    expect(mapLrclibResponse({ syncedLyrics: null, plainLyrics: 'hi' }).synced).toBeNull()
    expect(mapLrclibResponse({ syncedLyrics: null, plainLyrics: 'hi' }).plain).toBe('hi')
  })
  it('handles empty/none', () => {
    expect(mapLrclibResponse(null)).toEqual({ synced: null, plain: null, source: 'lrclib' })
  })
})
