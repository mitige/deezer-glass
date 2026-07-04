import { buildDeezerSearchUrl, pickDeezerCover, buildItunesSearchUrl, pickItunesCover } from './cover'

describe('buildDeezerSearchUrl', () => {
  it('hits the deezer search api', () => {
    const u = new URL(buildDeezerSearchUrl('Brittany Howard', 'Red Flags'))
    expect(u.host).toBe('api.deezer.com')
    expect(u.pathname).toBe('/search')
    expect(u.searchParams.get('q')).toBe('Brittany Howard Red Flags')
  })
})

describe('pickDeezerCover', () => {
  const json = { data: [
    { title: 'Other', artist: { name: 'X' }, album: { cover_xl: 'https://cdn/x-1000.jpg' } },
    { title: 'Red Flags', artist: { name: 'Brittany Howard' }, album: { cover_xl: 'https://cdn/rf-1000.jpg', cover_big: 'https://cdn/rf-500.jpg' } },
  ] }
  it('prefers cover_xl of the matching track', () => {
    expect(pickDeezerCover(json, 'Brittany Howard', 'Red Flags')).toBe('https://cdn/rf-1000.jpg')
  })
  it('falls back to the first cover when nothing matches', () => {
    expect(pickDeezerCover(json, 'No', 'Match')).toBe('https://cdn/x-1000.jpg')
  })
  it('returns null on empty/invalid', () => {
    expect(pickDeezerCover({ data: [] }, 'a', 'b')).toBeNull()
    expect(pickDeezerCover(null, 'a', 'b')).toBeNull()
  })
})

describe('pickItunesCover', () => {
  it('upscales artworkUrl100 to 1000x1000', () => {
    const json = { results: [{ trackName: 'Red Flags', artistName: 'Brittany Howard', artworkUrl100: 'https://is1.mzstatic.com/a/100x100bb.jpg' }] }
    expect(pickItunesCover(json, 'Brittany Howard', 'Red Flags')).toBe('https://is1.mzstatic.com/a/1000x1000bb.jpg')
  })
  it('returns null on empty', () => {
    expect(pickItunesCover({ results: [] }, 'a', 'b')).toBeNull()
  })
})
