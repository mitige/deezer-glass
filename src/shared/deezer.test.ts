import { buildDeezerUserDataUrl, buildDeezerLyricsUrl, buildDeezerSearchUrl, pickDeezerTrackId, parseDeezerSync } from './deezer'

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

describe('pickDeezerTrackId', () => {
  const json = { data: [
    { id: 111, title: 'Au DD (edit)', artist: { name: 'PNL' }, duration: 200 },
    { id: 222, title: 'Au DD', artist: { name: 'PNL' }, duration: 247 },
    { id: 333, title: 'Other', artist: { name: 'X' }, duration: 247 },
  ] }
  it('picks the title/artist match closest in duration', () => {
    expect(pickDeezerTrackId(json, { title: 'Au DD', artist: 'PNL', durationMs: 247000 })).toBe('222')
  })
  it('returns null when nothing matches', () => {
    expect(pickDeezerTrackId(json, { title: 'Nope', artist: 'Nobody', durationMs: 1000 })).toBeNull()
    expect(pickDeezerTrackId(null, { title: 'a', artist: 'b', durationMs: 1 })).toBeNull()
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
