import { buildDeezerUserDataUrl, buildDeezerLyricsUrl, buildDeezerSearchUrl, rankDeezerTrackIds, parseDeezerSync } from './deezer'

describe('deezer urls', () => {
  it('user-data + lyrics + search endpoints', () => {
    expect(buildDeezerUserDataUrl()).toContain('method=deezer.getUserData')
    expect(buildDeezerLyricsUrl('TOK')).toContain('method=song.getLyrics')
    expect(buildDeezerLyricsUrl('TOK')).toContain('api_token=TOK')
    const u = new URL(buildDeezerSearchUrl('PNL', 'Au DD'))
    expect(u.host).toBe('api.deezer.com')
    expect(u.searchParams.get('q')).toBe('PNL Au DD')
  })
})

describe('rankDeezerTrackIds', () => {
  const json = { data: [
    { id: 111, title: 'Au DD (edit)', artist: { name: 'PNL' }, album: { title: 'Single' }, duration: 200 },
    { id: 222, title: 'Au DD', artist: { name: 'PNL' }, album: { title: 'Deux frères' }, duration: 247 },
    { id: 333, title: 'Other', artist: { name: 'X' }, duration: 247 },
    { id: 444, title: 'Au DD', artist: { name: 'PNL' }, album: { title: 'Deux frères' }, duration: 300 },
  ] }
  it('prefers the same album, then closest duration', () => {
    expect(rankDeezerTrackIds(json, { title: 'Au DD', artist: 'PNL', album: 'Deux Frères', durationMs: 247000 })).toEqual(['222', '444', '111'])
  })
  it('falls back to duration when no album is given', () => {
    expect(rankDeezerTrackIds(json, { title: 'Au DD', artist: 'PNL', durationMs: 247000 })[0]).toBe('222')
  })
  it('returns [] when nothing matches', () => {
    expect(rankDeezerTrackIds(json, { title: 'Nope', artist: 'Nobody', durationMs: 1000 })).toEqual([])
    expect(rankDeezerTrackIds(null, { title: 'a', artist: 'b', durationMs: 1 })).toEqual([])
  })
})

describe('parseDeezerSync', () => {
  it('maps milliseconds + line to LyricLine[]', () => {
    const sync = [{ milliseconds: '1000', line: 'hi' }, { milliseconds: '3500', line: 'yo' }, { milliseconds: '5000', line: '' }]
    expect(parseDeezerSync(sync)).toEqual([{ timeMs: 1000, text: 'hi' }, { timeMs: 3500, text: 'yo' }, { timeMs: 5000, text: '' }])
  })
  it('ignores entries with no numeric timestamp and handles non-arrays', () => {
    expect(parseDeezerSync([{ line: 'x' }])).toEqual([])
    expect(parseDeezerSync(null)).toEqual([])
  })
})
