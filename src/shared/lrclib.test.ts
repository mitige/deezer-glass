import { buildLrclibGetUrl, mapLrclibResponse } from './lrclib'

describe('buildLrclibGetUrl', () => {
  it('builds a get query with seconds duration', () => {
    const u = new URL(buildLrclibGetUrl({ artist: 'A B', title: 'T (live)', album: 'Al', durationMs: 208_400 }))
    expect(u.origin + u.pathname).toBe('https://lrclib.net/api/get')
    expect(u.searchParams.get('artist_name')).toBe('A B')
    expect(u.searchParams.get('track_name')).toBe('T (live)')
    expect(u.searchParams.get('duration')).toBe('208')
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
